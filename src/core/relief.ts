// 起底：稠漆麻籽 / 手指捺痕，在 CPU 上确定性生成高度场
import type { BodyParams, ReliefParams } from './types'
import { hashSeed, mulberry32 } from './math_util'
import { domainSize, shapeProfile } from './shapes'

export interface ReliefField {
  resolution: number
  domain_mm: number
  // 长度 resolution*resolution，行优先，单位毫米，域外为 0
  heights: Float32Array
  mask: Uint8Array
}

// 生成整张起底高度场与胎体蒙版
export function buildRelief(body: BodyParams, relief: ReliefParams, resolution: number): ReliefField {
  const domain = domainSize(body)
  const profile = shapeProfile(body)
  const heights = new Float32Array(resolution * resolution)
  const mask = new Uint8Array(resolution * resolution)

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = (x / (resolution - 1)) * 2 - 1
      const v = (y / (resolution - 1)) * 2 - 1
      const idx = y * resolution + x
      mask[idx] = profile.maskAt(u, v) ? 1 : 0
    }
  }

  const rng = mulberry32(hashSeed(`${body.shape}:${relief.seed}:${relief.mode}`))
  const centers = generateCenters(relief, domain, rng)
  const px = domain / resolution
  const radiusPx = Math.max(1, relief.radius_mm / px)
  const stretch = Math.max(1, relief.stretch)

  for (const c of centers) {
    splat(heights, mask, resolution, c, radiusPx, relief.height_mm, stretch, domain)
  }

  // 域外严格清零，避免蒙版边缘渗色
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) heights[i] = 0
  }

  return { resolution, domain_mm: domain, heights, mask }
}

interface Center {
  gx: number
  gy: number
  amp: number
  angle: number
}

// 四种布点：抖动网格、手指捺、麻籽撒、棱脊走向
function generateCenters(
  relief: ReliefParams,
  domain: number,
  rng: () => number
): Center[] {
  const areaCm2 = (domain / 10) * (domain / 10)
  const count = Math.max(1, Math.round(relief.density_per_cm2 * areaCm2))
  const out: Center[] = []

  if (relief.mode === 'ridge') {
    // 平行棱脊：沿一条轴撒成行
    const rows = Math.max(2, Math.round(Math.sqrt(count / 2)))
    const cols = rows * 2
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        out.push({
          gx: ((i + 0.5) / cols + (rng() - 0.5) * relief.jitter * 0.4) * domain,
          gy: ((j + 0.5) / rows + (rng() - 0.5) * relief.jitter * 0.2) * domain,
          amp: 0.75 + rng() * 0.5,
          angle: 0
        })
      }
    }
    return out
  }

  if (relief.mode === 'hemp') {
    // 麻籽：完全泊松式随机撒点
    for (let i = 0; i < count; i++) {
      out.push({
        gx: rng() * domain,
        gy: rng() * domain,
        amp: 0.7 + rng() * 0.6,
        angle: rng() * Math.PI
      })
    }
    return out
  }

  // jittered / finger：抖动网格，finger 沿角度拉伸成捺痕
  const cols = Math.max(1, Math.round(Math.sqrt(count)))
  const rows = Math.max(1, Math.round(count / cols))
  const cell = domain / cols
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const jx = (rng() - 0.5) * relief.jitter * cell
      const jy = (rng() - 0.5) * relief.jitter * cell
      out.push({
        gx: (i + 0.5) * cell + jx,
        gy: (j + 0.5) * cell + jy,
        amp: 0.8 + rng() * 0.4,
        angle: relief.mode === 'finger' ? rng() * Math.PI : rng() * 0.3
      })
    }
  }
  return out
}

// 各向异性高斯鼓包
function splat(
  heights: Float32Array,
  mask: Uint8Array,
  resolution: number,
  c: Center,
  radiusPx: number,
  heightMm: number,
  stretch: number,
  domain: number
) {
  const cx = (c.gx / domain) * resolution
  const cy = (c.gy / domain) * resolution
  const rx = radiusPx * stretch
  const ry = radiusPx
  const cos = Math.cos(c.angle)
  const sin = Math.sin(c.angle)
  const reach = Math.ceil(rx) + 1
  const x0 = Math.max(0, Math.floor(cx - reach))
  const x1 = Math.min(resolution - 1, Math.ceil(cx + reach))
  const y0 = Math.max(0, Math.floor(cy - reach))
  const y1 = Math.min(resolution - 1, Math.ceil(cy + reach))

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = y * resolution + x
      if (!mask[idx]) continue
      const dx = x - cx
      const dy = y - cy
      const ex = cos * dx + sin * dy
      const ey = -sin * dx + cos * dy
      const d2 = (ex * ex) / (rx * rx) + (ey * ey) / (ry * ry)
      if (d2 > 4) continue
      const z = heightMm * c.amp * Math.exp(-d2 * 1.4)
      if (z > heights[idx]) heights[idx] = z
    }
  }
}
