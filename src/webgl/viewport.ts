// 3D 视口：网格渲染、轨道/俯视交互、研磨拾取
import type { OverlayMode, ViewMode, Work } from '../core/types'
import { meshFragmentShader, MESH_VS } from './mesh_shaders'
import { compileProgram } from './gl_util'
import { buildMesh, type MeshData } from './mesh_builder'
import { defaultCamera, LIGHT_PRESETS, viewProjection, type CameraState, type LightConfig } from './camera'
import { invert, rayPlane, type Mat4 } from './mat4'
import type { Simulation } from './sim_engine'

interface ViewOptions {
  viewMode: ViewMode
  overlay: OverlayMode
  light: keyof typeof LIGHT_PRESETS
  heatThreshold: number
  displace: number
}

export class Viewport {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private sim: Simulation
  private vao: WebGLVertexArrayObject
  private indexCount = 0
  private meshProg: WebGLProgram | null = null
  private mesh: MeshData
  camera: CameraState
  opts: ViewOptions = {
    viewMode: 'lacquer',
    overlay: 'both',
    light: 'studio',
    heatThreshold: 0.25,
    displace: 6
  }
  private invVp: Mat4 = new Float32Array(16)
  private dirty = true
  private shaderKey = ''
  private work: Work | null = null
  // 俯视模式下指针世界坐标回调（研磨页用）
  onPointerWorld: ((x: number, y: number, p: number) => void) | null = null

  constructor(canvas: HTMLCanvasElement, sim: Simulation, work: Work) {
    this.canvas = canvas
    this.sim = sim
    this.gl = sim.gl
    this.work = work
    this.mesh = buildMesh(work.body)
    this.camera = defaultCamera(sim.domain)
    this.vao = this.createVao()
    this.attachEvents()
    const ro = new ResizeObserver(() => this.resize())
    ro.observe(canvas.parentElement ?? canvas)
    this.resize()
  }

  private createVao(): WebGLVertexArrayObject {
    const gl = this.gl
    const vao = gl.createVertexArray()
    if (!vao) throw new Error('VAO 创建失败')
    gl.bindVertexArray(vao)

    const uvBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.uvs, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const flagBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, flagBuf)
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.topFlags, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0)

    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW)
    this.indexCount = this.mesh.indexCount

    gl.bindVertexArray(null)
    return vao
  }

  replaceMesh(work: Work) {
    this.work = work
    this.mesh = buildMesh(work.body)
    const gl = this.gl
    gl.deleteVertexArray(this.vao)
    this.vao = this.createVao()
    this.meshProg = null
    this.shaderKey = ''
    this.invalidate()
  }

  private attachEvents() {
    const c = this.canvas
    let dragging = false
    let lastX = 0
    let lastY = 0
    let panning = false

    c.addEventListener('pointerdown', (e) => {
      dragging = true
      panning = e.button === 2 || e.shiftKey
      lastX = e.clientX
      lastY = e.clientY
      c.setPointerCapture(e.pointerId)
      if (!panning && this.camera.mode === 'top' && this.onPointerWorld) {
        const hit = this.pick(e)
        if (hit) this.onPointerWorld(hit[0], hit[1], e.pressure || 0.5)
      }
    })

    c.addEventListener('pointermove', (e) => {
      if (dragging && !panning && this.camera.mode === 'top' && this.onPointerWorld) {
        const hit = this.pick(e)
        if (hit) this.onPointerWorld(hit[0], hit[1], e.pressure || 0.5)
        return
      }
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (panning) {
        this.camera.target[0] -= dx * 0.4
        this.camera.target[1] += dy * 0.4
      } else if (this.camera.mode === 'orbit') {
        this.camera.yaw += dx * 0.008
        this.camera.pitch = Math.min(1.45, Math.max(0.12, this.camera.pitch + dy * 0.008))
      }
      this.invalidate()
    })

    c.addEventListener('pointerup', () => {
      dragging = false
    })
    c.addEventListener('contextmenu', (e) => e.preventDefault())
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const factor = Math.exp(-e.deltaY * 0.0012)
        if (this.camera.mode === 'top') {
          this.camera.zoom = Math.min(8, Math.max(0.4, this.camera.zoom * factor))
        } else {
          this.camera.distance = Math.min(
            this.sim.domain * 3,
            Math.max(this.sim.domain * 0.4, this.camera.distance / factor)
          )
        }
        this.invalidate()
      },
      { passive: false }
    )
  }

  // 屏幕坐标 -> 盘面 z=0 平面世界坐标
  pick(e: PointerEvent | MouseEvent): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    return rayPlane(this.invVp, ndcX, ndcY, this.camera.target[2])
  }

  setMode(mode: CameraState['mode']) {
    this.camera.mode = mode
    this.invalidate()
  }

  resetView() {
    this.camera = defaultCamera(this.sim.domain)
    this.invalidate()
  }

  invalidate() {
    this.dirty = true
  }

  private resize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(64, parent.clientWidth)
    const h = Math.max(64, parent.clientHeight)
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.invalidate()
  }

  render() {
    if (!this.dirty || !this.work) return
    const gl = this.gl
    const work = this.work
    const aspect = this.canvas.width / this.canvas.height
    const { vp, eye } = viewProjection(this.camera, aspect)
    this.invVp = invert(vp)

    const key = `${work.layers.length}|${this.opts.viewMode}|${this.opts.overlay}|${this.opts.light}`
    if (!this.meshProg || this.shaderKey !== key) {
      const light = LIGHT_PRESETS[this.opts.light]
      if (this.meshProg) gl.deleteProgram(this.meshProg)
      this.meshProg = compileProgram(
        gl,
        MESH_VS,
        meshFragmentShader({
          viewMode: this.opts.viewMode,
          overlay: this.opts.overlay,
          layerCount: Math.max(1, work.layers.length),
          domain: this.sim.domain,
          texel: [1 / this.sim.size, 1 / this.sim.size],
          lightDir: light.dir,
          lightColor: light.color,
          ambient: light.ambient,
          clearcoat: light.clearcoat,
          cameraPos: eye as [number, number, number],
          heatThreshold: this.opts.heatThreshold
        })
      )
      this.shaderKey = key
    }

    const prog = this.meshProg
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.enable(gl.DEPTH_TEST)
    gl.clearColor(0.86, 0.88, 0.91, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_view_proj'), false, vp)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_domain'), this.sim.domain)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_displace'), this.opts.displace)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_layer_count'), work.layers.length)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_view_mode'), viewModeId(this.opts.viewMode))
    gl.uniform1i(gl.getUniformLocation(prog, 'u_overlay'), overlayId(this.opts.overlay))
    this.setLightUniforms(prog, LIGHT_PRESETS[this.opts.light], eye)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_heat_threshold'), this.opts.heatThreshold)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sim.gTexture)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_g'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.sim.baseTexture)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_base'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.sim.stackTexture)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_stack'), 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.sim.colorTexture)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_colors'), 3)

    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
    gl.bindVertexArray(null)
    this.dirty = false
  }

  private setLightUniforms(prog: WebGLProgram, light: LightConfig, eye: number[]) {
    const gl = this.gl
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_light_dir'), light.dir)
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_light_color'), light.color)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_ambient'), light.ambient)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_clearcoat'), light.clearcoat)
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_camera_pos'), eye)
  }
}

function viewModeId(m: ViewMode): number {
  return m === 'lacquer' ? 0 : m === 'relief' ? 1 : 2
}
function overlayId(o: OverlayMode): number {
  return o === 'none' ? 0 : o === 'alert' ? 1 : o === 'heatmap' ? 2 : 3
}
