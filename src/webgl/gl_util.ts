// WebGL2 底层封装：程序、浮点纹理、帧缓冲、全屏绘制

export function createGl(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true
  })
  if (!gl) throw new Error('当前浏览器不支持 WebGL2')
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('缺少 EXT_color_buffer_float，无法进行浮点推演')
  }
  return gl
}

export function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs)
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs)
  const p = gl.createProgram()
  if (!p) throw new Error('创建程序失败')
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('程序链接失败: ' + gl.getProgramInfoLog(p))
  }
  gl.deleteShader(v)
  gl.deleteShader(f)
  return p
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('创建着色器失败')
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(s) + '\n' + src)
  }
  return s
}

// R32F 单通道浮点纹理
export function floatTexture(
  gl: WebGL2RenderingContext,
  size: number,
  data: Float32Array | null
): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('创建纹理失败')
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, size, size)
  if (data) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RED, gl.FLOAT, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

// RGBA8 蒙版+高度混合纹理（裸胎用，a 通道存蒙版）
export function rgbaTexture(
  gl: WebGL2RenderingContext,
  size: number,
  data: Float32Array
): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('创建纹理失败')
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, size, size)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RGBA, gl.FLOAT, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

// 层高度数组纹理：每层一片
export function layerArrayTexture(gl: WebGL2RenderingContext, size: number, depth: number): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('创建数组纹理失败')
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t)
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R32F, size, size, depth)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

// 层颜色 LUT 数组纹理：1x1 x 16，RGBA8
export function colorArrayTexture(gl: WebGL2RenderingContext, depth: number): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('创建颜色纹理失败')
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t)
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, depth)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  return t
}

export function createFbo(gl: WebGL2RenderingContext): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('创建帧缓冲失败')
  return fbo
}

// 绑定若干颜色附件并检查完整性
export function bindTargets(gl: WebGL2RenderingContext, fbo: WebGLFramebuffer, targets: WebGLTexture[]): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  const buffers: number[] = []
  targets.forEach((tex, i) => {
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0 + i,
      gl.TEXTURE_2D,
      tex,
      0
    )
    buffers.push(gl.COLOR_ATTACHMENT0 + i)
  })
  gl.drawBuffers(buffers)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('帧缓冲不完整: ' + status)
}

export function bindLayerTarget(
  gl: WebGL2RenderingContext,
  fbo: WebGLFramebuffer,
  tex: WebGLTexture,
  layer: number
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, layer)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
}

// 无顶点缓冲全屏绘制（依赖 gl_VertexID）
export function drawQuad(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

export function uniform1i(p: WebGLProgram, gl: WebGL2RenderingContext, name: string, v: number): void {
  gl.uniform1i(gl.getUniformLocation(p, name), v)
}
