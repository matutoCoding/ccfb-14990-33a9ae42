// WebGL2 计算类着色器（全屏三角形 + 浮点纹理）
// 所有推演 pass 都在固定网格上做纯函数运算，保证同参数同结果

export const QUAD_VS = `#version 300 es
precision highp float;
const vec2 QUAD[4] = vec2[4](
  vec2(-1.0, -1.0), vec2(1.0, -1.0),
  vec2(-1.0, 1.0), vec2(1.0, 1.0)
);
void main() {
  gl_Position = vec4(QUAD[gl_VertexID], 0.0, 1.0);
}`

// 髹一层：u_base.r=裸胎高度, u_base.a=蒙版; u_stack 为各层顶面高度数组
// MRT 输出：0=新顶面高度, 1=本层实际厚度
export const DEPOSIT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_base;
uniform sampler2DArray u_stack;
uniform int u_layer_index;
uniform float u_nominal;
uniform float u_flow;
uniform vec2 u_texel;
layout(location = 0) out float out_height;
layout(location = 1) out float out_thick;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float base = texelFetch(u_base, p, 0).r;
  float mask = texelFetch(u_base, p, 0).a;
  float prev = u_layer_index == 0
    ? base
    : texelFetch(u_stack, ivec3(p, u_layer_index - 1), 0).r;

  float hL = texelFetch(u_base, p - ivec2(1, 0), 0).r;
  float hR = texelFetch(u_base, p + ivec2(1, 0), 0).r;
  float hD = texelFetch(u_base, p - ivec2(0, 1), 0).r;
  float hU = texelFetch(u_base, p + ivec2(0, 1), 0).r;
  if (u_layer_index > 0) {
    hL = texelFetch(u_stack, ivec3(p - ivec2(1, 0), u_layer_index - 1), 0).r;
    hR = texelFetch(u_stack, ivec3(p + ivec2(1, 0), u_layer_index - 1), 0).r;
    hD = texelFetch(u_stack, ivec3(p - ivec2(0, 1), u_layer_index - 1), 0).r;
    hU = texelFetch(u_stack, ivec3(p + ivec2(0, 1), u_layer_index - 1), 0).r;
  }

  // 拉普拉斯曲率：凸顶为负、凹处为正；凸顶流薄、凹处积厚
  float lap = (hL + hR + hD + hU) - 4.0 * prev;
  float k_norm = clamp(-lap / (u_nominal * 3.0 + 0.02), -1.0, 1.0);
  float dx = hR - hL;
  float dy = hU - hD;
  float slope = length(vec2(dx, dy)) * 0.5;
  float slope_norm = clamp(slope / (u_nominal * 4.0 + 0.03), 0.0, 1.0);

  float factor = 1.0 - u_flow * k_norm - 0.3 * u_flow * slope_norm;
  factor = clamp(factor, 0.35, 1.9);
  float t = u_nominal * factor;
  float h = prev + t;
  if (h < base) {
    h = base;
    t = 0.0;
  }
  out_height = mask > 0.5 ? h : 0.0;
  out_thick = mask > 0.5 ? t : 0.0;
}`

// 研磨：对定长重采样的触点取最大切深，planar 模式整体下磨
export const GRIND_FS = `#version 300 es
precision highp float;
#define MAX_SAMPLES 128
uniform sampler2D u_g;
uniform sampler2D u_base;
uniform vec4 u_samples[MAX_SAMPLES];
uniform int u_count;
uniform float u_cut_base;
uniform float u_planar;
uniform float u_hardness;
uniform float u_domain;
uniform vec2 u_texel;
out float out_g;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 b = texelFetch(u_base, p, 0);
  if (b.a < 0.5) {
    out_g = 0.0;
    return;
  }
  vec2 uv = (vec2(p) + 0.5) * u_texel;
  vec2 world = (uv - 0.5) * u_domain;
  float g = texelFetch(u_g, p, 0).r;
  float cut = u_planar;

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= u_count) break;
    vec4 s = u_samples[i];
    float q = distance(world, s.xy) / s.z;
    if (q < 1.0) {
      float profile = pow(1.0 - q * q, u_hardness * 2.0 + 0.5);
      cut = max(cut, u_cut_base * profile);
    }
  }
  // 磨穿后停在裸胎面，穿点由渲染器标红
  out_g = max(b.r, g - cut);
}`

// 高斯模糊（OBJ 栅格化与光整用），分离式单次横纵由 uniform 控制
export const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_sigma_px;
out vec4 out_color;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int radius = max(1, int(ceil(u_sigma_px * 2.0)));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -8; i <= 8; i++) {
    if (i < -radius || i > radius) continue;
    float w = exp(-float(i * i) / (2.0 * u_sigma_px * u_sigma_px));
    acc += texelFetch(u_src, p + ivec2(u_dir * float(i)), 0) * w;
    wsum += w;
  }
  out_color = acc / wsum;
}`

// 均值降采样到统计网格
export const DOWNSAMPLE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform int u_block;
out float out_v;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * u_block;
  float acc = 0.0;
  for (int y = 0; y < 32; y++) {
    if (y >= u_block) break;
    for (int x = 0; x < 32; x++) {
      if (x >= u_block) break;
      acc += texelFetch(u_src, p + ivec2(x, y), 0).r;
    }
  }
  out_v = acc / float(u_block * u_block);
}`

export const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
out float out_v;
void main() {
  out_v = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).r;
}`

export const COPY_ARRAY_FS = `#version 300 es
precision highp float;
uniform sampler2DArray u_src;
uniform int u_layer;
out float out_v;
void main() {
  out_v = texelFetch(u_src, ivec3(ivec2(gl_FragCoord.xy), u_layer), 0).r;
}`

// 磨穿判定：G 落到裸胎面附近返回 1，域外为 0
export const PIERCE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_g;
uniform sampler2D u_base;
out float out_v;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float mask = texelFetch(u_base, p, 0).a;
  if (mask < 0.5) {
    out_v = 0.0;
    return;
  }
  float g = texelFetch(u_g, p, 0).r;
  float base = texelFetch(u_base, p, 0).r;
  out_v = g <= base + 0.0015 ? 1.0 : 0.0;
}`
