// 犀皮漆推演引擎：胎体高度场 -> 逐层髹涂 -> 研磨回放，全部 GPU 浮点运算
import type {
  GrindOperation,
  LacquerLayer,
  LayerStat,
  Work
} from '../core/types'
import type { ReliefField } from '../core/relief'
import { MAX_LAYERS, STAT_RESOLUTION } from '../core/types'
import { hexToRgb01 } from '../core/math_util'
import {
  COPY_ARRAY_FS,
  COPY_FS,
  DEPOSIT_FS,
  DOWNSAMPLE_FS,
  GRIND_FS,
  QUAD_VS
} from './shaders'
import {
  bindLayerTarget,
  bindTargets,
  colorArrayTexture,
  compileProgram,
  createFbo,
  drawQuad,
  floatTexture,
  rgbaTexture
} from './gl_util'
import { readFieldStats, readPierceRatio } from './sim_stats'


const SAMPLE_CHUNK = 128

export class Simulation {
  readonly gl: WebGL2RenderingContext
  readonly size: number

  private baseTex!: WebGLTexture
  private stackTex!: WebGLTexture
  private colorTex!: WebGLTexture
  private gA!: WebGLTexture
  private gB!: WebGLTexture
  private heightTmp!: WebGLTexture
  private thickTmp!: WebGLTexture
  private fboA!: WebGLFramebuffer
  private fboB!: WebGLFramebuffer

  private depositProg!: WebGLProgram
  private grindProg!: WebGLProgram
  private copyProg!: WebGLProgram
  private copyArrayProg!: WebGLProgram
  private downProg!: WebGLProgram

  private layerCount = 0
  private layerStats: LayerStat[] = []
  private baseData: Float32Array = new Float32Array(0)
  private domainMm = 400
  private currentG = 0

  constructor(gl: WebGL2RenderingContext, size: number) {
    this.gl = gl
    this.size = size
    this.initGl()
  }

  private initGl() {
    const gl = this.gl
    this.depositProg = compileProgram(gl, QUAD_VS, DEPOSIT_FS)
    this.grindProg = compileProgram(gl, QUAD_VS, GRIND_FS)
    this.copyProg = compileProgram(gl, QUAD_VS, COPY_FS)
    this.copyArrayProg = compileProgram(gl, QUAD_VS, COPY_ARRAY_FS)
    this.downProg = compileProgram(gl, QUAD_VS, DOWNSAMPLE_FS)
    this.stackTex = this.makeLayerArray(MAX_LAYERS)
    this.colorTex = colorArrayTexture(gl, MAX_LAYERS)
    this.fboA = createFbo(gl)
    this.fboB = createFbo(gl)
    this.gA = floatTexture(gl, this.size, null)
    this.gB = floatTexture(gl, this.size, null)
    this.heightTmp = floatTexture(gl, this.size, null)
    this.thickTmp = floatTexture(gl, this.size, null)
  }

  private makeLayerArray(depth: number): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()
    if (!t) throw new Error('数组纹理创建失败')
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t)
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R32F, this.size, this.size, depth)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  get baseTexture() {
    return this.baseTex
  }
  get stackTexture() {
    return this.stackTex
  }
  get colorTexture() {
    return this.colorTex
  }
  get gTexture() {
    return this.currentG === 0 ? this.gA : this.gB
  }
  get stats() {
    return this.layerStats
  }
  get domain() {
    return this.domainMm
  }

  // 写入裸胎高度（含蒙版于 alpha），OBJ 模式直接传栅格化结果
  uploadBase(field: ReliefField, domainMm: number) {
    const gl = this.gl
    this.domainMm = domainMm
    const rgba = new Float32Array(this.size * this.size * 4)
    for (let i = 0; i < this.size * this.size; i++) {
      rgba[i * 4] = field.heights[i]
      rgba[i * 4 + 3] = field.mask[i]
    }
    this.baseData = rgba
    if (this.baseTex) gl.deleteTexture(this.baseTex)
    this.baseTex = rgbaTexture(gl, this.size, rgba)
  }

  // 用 OBJ 栅格化结果替换裸胎，需同时提供蒙版
  uploadObjBase(rgba: Float32Array, domainMm: number) {
    const gl = this.gl
    this.domainMm = domainMm
    this.baseData = rgba
    if (this.baseTex) gl.deleteTexture(this.baseTex)
    this.baseTex = rgbaTexture(gl, this.size, rgba)
  }

  // 逐层髹涂，返回每层实际厚度统计；收缩率作用于名义厚度
  rebuildLayers(work: Work): LayerStat[] {
    const gl = this.gl
    this.layerCount = work.layers.length
    this.layerStats = []
    const texel = 1 / this.size
    const block = this.size / STAT_RESOLUTION

    work.layers.forEach((layer, idx) => {
      const nominal = layer.thickness_mm * (1 - layer.shrink)
      const prog = this.depositProg
      gl.useProgram(prog)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.baseTex)
      gl.uniform1i(gl.getUniformLocation(prog, 'u_base'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.stackTex)
      gl.uniform1i(gl.getUniformLocation(prog, 'u_stack'), 1)
      gl.uniform1i(gl.getUniformLocation(prog, 'u_layer_index'), idx)
      gl.uniform1f(gl.getUniformLocation(prog, 'u_nominal'), nominal)
      gl.uniform1f(gl.getUniformLocation(prog, 'u_flow'), layer.flow)
      gl.uniform2f(gl.getUniformLocation(prog, 'u_texel'), texel, texel)
      bindTargets(gl, this.fboA, [this.heightTmp, this.thickTmp])
      gl.viewport(0, 0, this.size, this.size)
      drawQuad(gl)

      bindLayerTarget(gl, this.fboB, this.stackTex, idx)
      this.blitArray(this.heightTmp)
      this.uploadColor(layer, idx)
      this.layerStats.push(
        readFieldStats(gl, this.downProg, this.fboA, this.thickTmp, this.size, block, idx)
      )
    })
    return this.layerStats
  }

  private uploadColor(layer: LacquerLayer, idx: number) {
    const gl = this.gl
    const [r, g, b] = hexToRgb01(layer.color)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.colorTex)
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      idx,
      1,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255])
    )
  }

  // 从裸胎开始完整重放所有研磨操作，确定性结果只依赖操作记录
  replayAll(operations: GrindOperation[]) {
    this.resetG()
    operations.forEach((op) => this.applyOperation(op))
  }

  // 重放到第 step 个操作（含），用于时间轴定位
  replayTo(operations: GrindOperation[], step: number) {
    this.resetG()
    operations.slice(0, step + 1).forEach((op) => this.applyOperation(op))
  }

  // G 初始化为最后一层顶面，经 2D 中转纹理避免同纹理反馈
  private resetG() {
    const gl = this.gl
    this.currentG = 0
    if (this.layerCount === 0) {
      // 无漆层时磨面贴裸胎，避免未初始化纹理
      gl.useProgram(this.copyProg)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.baseTex)
      gl.uniform1i(gl.getUniformLocation(this.copyProg, 'u_src'), 0)
      bindTargets(gl, this.fboA, [this.gA])
      gl.viewport(0, 0, this.size, this.size)
      drawQuad(gl)
      return
    }
    gl.useProgram(this.copyArrayProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.stackTex)
    gl.uniform1i(gl.getUniformLocation(this.copyArrayProg, 'u_src'), 0)
    gl.uniform1i(gl.getUniformLocation(this.copyArrayProg, 'u_layer'), this.layerCount - 1)
    bindTargets(gl, this.fboA, [this.gA])
    gl.viewport(0, 0, this.size, this.size)
    drawQuad(gl)
  }

  // 试算单刀：在当前 G 上直接叠加，不改变已存档操作
  applyOne(op: GrindOperation) {
    this.applyOperation(op)
  }

  private applyOperation(op: GrindOperation) {
    if (op.tool.type === 'planar') {
      this.grindPass([], op, op.planar_depth_mm)
      return
    }
    const chunks: typeof op.samples[] = []
    for (let i = 0; i < op.samples.length; i += SAMPLE_CHUNK) {
      chunks.push(op.samples.slice(i, i + SAMPLE_CHUNK))
    }
    if (chunks.length === 0) chunks.push([])
    chunks.forEach((samples) => this.grindPass(samples, op, 0))
  }

  private grindPass(samples: GrindOperation['samples'], op: GrindOperation, planar: number) {
    const gl = this.gl
    const src = this.currentG === 0 ? this.gA : this.gB
    const dst = this.currentG === 0 ? this.gB : this.gA
    const prog = this.grindProg
    gl.useProgram(prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_g'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_base'), 1)

    const data = new Float32Array(SAMPLE_CHUNK * 4)
    const radius = op.tool.diameter_mm / 2
    samples.forEach((s, i) => {
      data[i * 4] = s.x
      data[i * 4 + 1] = s.y
      data[i * 4 + 2] = radius
      data[i * 4 + 3] = s.p
    })
    gl.uniform4fv(gl.getUniformLocation(prog, 'u_samples[0]'), data)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_count'), samples.length)
    // 单触点最大切深：力度 × 硬度 × 经验系数 0.06 毫米
    const cutBase = op.tool.pressure * op.tool.hardness * 0.06
    gl.uniform1f(gl.getUniformLocation(prog, 'u_cut_base'), cutBase)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_planar'), planar)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_hardness'), op.tool.hardness)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_domain'), this.domainMm)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texel'), 1 / this.size, 1 / this.size)

    bindTargets(gl, this.fboA, [dst])
    gl.viewport(0, 0, this.size, this.size)
    drawQuad(gl)
    this.currentG = this.currentG === 0 ? 1 : 0
  }

  // 2D 中转纹理 -> 当前已绑定的 fbo
  private blitArray(src: WebGLTexture) {
    const gl = this.gl
    gl.useProgram(this.copyProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.uniform1i(gl.getUniformLocation(this.copyProg, 'u_src'), 0)
    gl.viewport(0, 0, this.size, this.size)
    drawQuad(gl)
  }

  // 磨穿面积占比（0~1），用于工艺预警
  pierceRatio(): number {
    return readPierceRatio(
      this.gl,
      this.gTexture,
      this.baseTexture,
      this.downProg,
      this.fboA,
      this.size,
      this.size / STAT_RESOLUTION
    )
  }

  baseRgbaAt(i: number): Float32Array {
    return this.baseData.subarray(i * 4, i * 4 + 4)
  }
}
