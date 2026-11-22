// GPU 统计读数：层厚降采样 + 磨穿占比，读回 CPU 供工艺单与预警使用
import type { LayerStat } from '../core/types'
import { STAT_RESOLUTION } from '../core/types'
import { PIERCE_FS, QUAD_VS } from './shaders'
import { bindTargets, compileProgram, createFbo, drawQuad, floatTexture } from './gl_util'

interface StatsCache {
  small: WebGLTexture
  pierce: WebGLTexture
  fbo: WebGLFramebuffer
  pierceProg: WebGLProgram
}

const cache = new WeakMap<WebGL2RenderingContext, StatsCache>()

function getCache(gl: WebGL2RenderingContext): StatsCache {
  let c = cache.get(gl)
  if (c) return c
  c = {
    small: floatTexture(gl, STAT_RESOLUTION, null),
    pierce: floatTexture(gl, STAT_RESOLUTION, null),
    fbo: createFbo(gl),
    pierceProg: compileProgram(gl, QUAD_VS, PIERCE_FS)
  }
  cache.set(gl, c)
  return c
}

function readSmall(gl: WebGL2RenderingContext, tex: WebGLTexture, fbo: WebGLFramebuffer): Float32Array {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.viewport(0, 0, STAT_RESOLUTION, STAT_RESOLUTION)
  const buf = new Float32Array(STAT_RESOLUTION * STAT_RESOLUTION)
  gl.readPixels(0, 0, STAT_RESOLUTION, STAT_RESOLUTION, gl.RED, gl.FLOAT, buf)
  return buf
}

// 层厚统计：先均值降采样再读回，避免全分辨率回读卡顿
export function readFieldStats(
  gl: WebGL2RenderingContext,
  downProg: WebGLProgram,
  workFbo: WebGLFramebuffer,
  src: WebGLTexture,
  fullSize: number,
  block: number,
  layerIndex: number
): LayerStat {
  const c = getCache(gl)
  gl.useProgram(downProg)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, src)
  gl.uniform1i(gl.getUniformLocation(downProg, 'u_src'), 0)
  gl.uniform2f(gl.getUniformLocation(downProg, 'u_texel'), 1 / fullSize, 1 / fullSize)
  gl.uniform1i(gl.getUniformLocation(downProg, 'u_block'), block)
  bindTargets(gl, c.fbo, [c.small])
  drawQuad(gl)
  const buf = readSmall(gl, c.small, c.fbo)
  let sum = 0
  let min = Infinity
  let max = 0
  let n = 0
  for (const v of buf) {
    if (v <= 0) continue
    sum += v
    min = Math.min(min, v)
    max = Math.max(max, v)
    n++
  }
  void workFbo
  return {
    layer_index: layerIndex,
    avg_mm: n ? sum / n : 0,
    min_mm: n ? min : 0,
    max_mm: max
  }
}

export function readPierceRatio(
  gl: WebGL2RenderingContext,
  gTexture: WebGLTexture,
  baseTexture: WebGLTexture,
  downProg: WebGLProgram,
  workFbo: WebGLFramebuffer,
  fullSize: number,
  block: number
): number {
  const c = getCache(gl)
  gl.useProgram(c.pierceProg)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, gTexture)
  gl.uniform1i(gl.getUniformLocation(c.pierceProg, 'u_g'), 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, baseTexture)
  gl.uniform1i(gl.getUniformLocation(c.pierceProg, 'u_base'), 1)
  bindTargets(gl, c.fbo, [c.pierce])
  gl.viewport(0, 0, fullSize, fullSize)
  drawQuad(gl)

  // 再降采样求平均
  gl.useProgram(downProg)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, c.pierce)
  gl.uniform1i(gl.getUniformLocation(downProg, 'u_src'), 0)
  gl.uniform2f(gl.getUniformLocation(downProg, 'u_texel'), 1 / fullSize, 1 / fullSize)
  gl.uniform1i(gl.getUniformLocation(downProg, 'u_block'), block)
  bindTargets(gl, c.fbo, [c.small])
  gl.viewport(0, 0, STAT_RESOLUTION, STAT_RESOLUTION)
  drawQuad(gl)
  const buf = readSmall(gl, c.small, c.fbo)
  void workFbo
  // 均值网格里 0 可能是域外也可能是未穿点，用非零计数近似占比
  let hit = 0
  for (const v of buf) if (v > 0.5) hit++
  return hit / buf.length
}
