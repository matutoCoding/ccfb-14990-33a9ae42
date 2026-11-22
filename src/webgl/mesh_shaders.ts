// 展示类着色器：网格顶点位移 + 漆面 PBR-lite 光照
import type { OverlayMode, ViewMode } from '../core/types'

export const MESH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_top;
uniform sampler2D u_g;
uniform sampler2D u_base;
uniform mat4 u_view_proj;
uniform float u_domain;
uniform float u_displace;
out vec2 v_uv;
out float v_top;
out float v_mask;

void main() {
  v_uv = a_uv;
  v_top = a_top;
  vec4 b = texture(u_base, a_uv);
  float z = b.r;
  float mask = b.a;
  if (a_top > 0.5 && mask > 0.5) {
    z = texture(u_g, a_uv).r;
  }
  v_mask = a_top > 0.5 ? mask : 1.0;
  vec3 pos = vec3((a_uv - 0.5) * u_domain, z * u_displace);
  gl_Position = u_view_proj * vec4(pos, 1.0);
}`

interface RenderUniforms {
  viewMode: ViewMode
  overlay: OverlayMode
  layerCount: number
  domain: number
  texel: [number, number]
  lightDir: [number, number, number]
  lightColor: [number, number, number]
  ambient: number
  clearcoat: number
  cameraPos: [number, number, number]
  heatThreshold: number
}

export function meshFragmentShader(u: RenderUniforms): string {
  return `#version 300 es
precision highp float;
uniform sampler2D u_g;
uniform sampler2D u_base;
uniform sampler2DArray u_stack;
uniform sampler2DArray u_colors;
uniform int u_layer_count;
uniform int u_view_mode;
uniform int u_overlay;
uniform vec2 u_texel;
uniform vec3 u_light_dir;
uniform vec3 u_light_color;
uniform float u_ambient;
uniform float u_clearcoat;
uniform vec3 u_camera_pos;
uniform float u_heat_threshold;
in vec2 v_uv;
in float v_top;
in float v_mask;
out vec4 frag;

vec3 layerColor(int idx) {
  return texture(u_colors, vec3(0.5, 0.5, float(idx))).rgb;
}

void main() {
  if (v_mask < 0.5) discard;
  vec4 b = texture(u_base, v_uv);
  float g = texture(u_g, v_uv).r;

  // 有限差分法线，位移统一在毫米空间
  float gx = texture(u_g, v_uv + vec2(u_texel.x, 0.0)).r
           - texture(u_g, v_uv - vec2(u_texel.x, 0.0)).r;
  float gy = texture(u_g, v_uv + vec2(0.0, u_texel.y)).r
           - texture(u_g, v_uv - vec2(0.0, u_texel.y)).r;
  vec3 n = normalize(vec3(-gx / (2.0 * u_texel.x * ${u.domain.toFixed(2)}),
                          -gy / (2.0 * u_texel.y * ${u.domain.toFixed(2)}), 1.0));
  vec3 V = normalize(u_camera_pos - vec3((v_uv - 0.5) * ${u.domain.toFixed(2)}, g));
  vec3 L = normalize(u_light_dir);
  vec3 H = normalize(L + V);

  // 起底检视模式：按高度涂灰阶
  if (u_view_mode == 1) {
    float lo = texture(u_base, vec2(0.5)).r;
    float h = clamp((g - b.r) * 4.0, 0.0, 1.0);
    vec3 gray = mix(vec3(0.32), vec3(0.92), h);
    float diff = max(dot(n, L), 0.0);
    frag = vec4(gray * (u_ambient + 0.55 * diff), 1.0);
    return;
  }

  // 无漆层直接显示胎体警示色，避免数组纹理越界采样
  if (u_layer_count == 0) {
    float diff = max(dot(n, L), 0.0);
    frag = vec4(vec3(0.45, 0.42, 0.4) * (u_ambient + 0.5 * diff), 1.0);
    return;
  }

  // 二分查找磨面落在哪一层
  int idx = 0;
  int lo_i = 0;
  int hi_i = max(0, u_layer_count - 1);
  for (int k = 0; k < ${Math.ceil(Math.log2(u.layerCount + 1)) + 1}; k++) {
    if (hi_i - lo_i <= 0) break;
    int mid = (lo_i + hi_i) / 2;
    float hk = texture(u_stack, vec3(v_uv, float(mid))).r;
    if (g >= hk) lo_i = mid + 1;
    else hi_i = mid;
  }
  idx = clamp(lo_i, 0, max(0, u_layer_count - 1));
  vec3 baseCol = layerColor(idx);

  // 磨穿标红
  bool pierced = g <= b.r + 0.0015;
  // 剩余漆厚热力图
  float remain = g - b.r;
  bool thin = remain < u_heat_threshold;

  if (u_view_mode == 2) {
    float t = clamp(1.0 - remain / u_heat_threshold, 0.0, 1.0);
    vec3 heat = mix(vec3(0.18, 0.55, 0.95), vec3(0.93, 0.27, 0.2), t);
    frag = vec4(heat, 1.0);
    return;
  }

  // 漆面光照：漫反射 wrap + 清漆高光 + 菲涅耳 + 深层透色
  float ndl = max(dot(n, L), 0.0);
  float wrap = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
  vec3 deep = layerColor(max(0, idx - 1)) * 0.18;
  vec3 diffuse = (baseCol * (u_ambient + 0.62 * wrap) + deep) * u_light_color;
  float spec = pow(max(dot(n, H), 0.0), 90.0) * u_clearcoat;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  vec3 col = diffuse + u_light_color * (spec + 0.18 * fres * u_clearcoat);

  if ((u_overlay == 1 || u_overlay == 3) && pierced) {
    col = vec3(0.85, 0.08, 0.05);
  } else if ((u_overlay == 2 || u_overlay == 3) && thin) {
    float t = clamp(1.0 - remain / u_heat_threshold, 0.0, 1.0);
    col = mix(col, vec3(0.95, 0.45, 0.1), t * 0.75);
  }
  frag = vec4(col, 1.0);
}`
}
