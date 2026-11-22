// 纹样量化：色块面积占比（k-means 聚类）+ 纹路密度（Sobel 边缘占比）
// 参考图与推演结果走同一套算法，指标才可横向对比
import type { PatternMetrics } from './types'
import { clamp } from './math_util'

interface Pixel {
  r: number
  g: number
  b: number
}

const K = 5

export function analyzeCanvas(source: CanvasImageSource, size = 160): PatternMetrics {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return emptyMetrics()
  ctx.drawImage(source, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const pixels: Pixel[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  if (pixels.length === 0) return emptyMetrics()

  const centers = kmeans(pixels, K)
  const ratio = new Array(K).fill(0)
  for (const p of pixels) {
    ratio[nearest(p, centers)]++
  }
  const color_ratio = centers
    .map((c, i) => ({ color: toHex(c), ratio: ratio[i] / pixels.length }))
    .filter((c) => c.ratio > 0.02)
    .sort((a, b) => b.ratio - a.ratio)

  const gray = toGray(pixels, size, data)
  let edges = 0
  let ringEdges = 0
  let ringTotal = 0
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x
      const gx = gray[i + 1] - gray[i - 1]
      const gy = gray[i + size] - gray[i - size]
      const mag = Math.hypot(gx, gy)
      if (mag > 28) edges++
      // 圈纹：切向（环绕中心）梯度显著、径向梯度弱
      const dx = x - size / 2
      const dy = y - size / 2
      const len = Math.hypot(dx, dy)
      if (len > 8) {
        ringTotal++
        const radial = Math.abs((gx * dx + gy * dy) / len)
        const tangent = Math.abs((-gy * dx + gx * dy) / len)
        if (tangent > 28 && radial < tangent * 0.7) ringEdges++
      }
    }
  }

  return {
    color_ratio,
    line_density: edges / ((size - 2) * (size - 2)),
    ring_density: ringTotal ? ringEdges / ringTotal : 0
  }
}

function kmeans(pixels: Pixel[], k: number): Pixel[] {
  // 确定性初值：按亮度均匀取种，避免随机初始化抖动
  const sorted = [...pixels].sort((a, b) => lum(a) - lum(b))
  const centers: Pixel[] = []
  for (let i = 0; i < k; i++) {
    centers.push({ ...sorted[Math.floor((i + 0.5) * sorted.length / k)] })
  }
  const assign = new Array(pixels.length).fill(0)
  for (let iter = 0; iter < 12; iter++) {
    let moved = 0
    for (let i = 0; i < pixels.length; i++) {
      const n = nearest(pixels[i], centers)
      if (n !== assign[i]) moved++
      assign[i] = n
    }
    if (moved === 0 && iter > 1) break
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
    pixels.forEach((p, i) => {
      const s = sums[assign[i]]
      s.r += p.r
      s.g += p.g
      s.b += p.b
      s.n++
    })
    sums.forEach((s, i) => {
      if (s.n > 0) {
        centers[i] = { r: s.r / s.n, g: s.g / s.n, b: s.b / s.n }
      }
    })
  }
  return centers
}

function nearest(p: Pixel, centers: Pixel[]): number {
  let best = 0
  let bestD = Infinity
  centers.forEach((c, i) => {
    const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function toGray(pixels: Pixel[], size: number, rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(size * size)
  let k = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 200) {
      out[k] = 255
    } else {
      out[k] = lum(pixels[Math.min(k, pixels.length - 1)])
    }
    k++
  }
  return out
}

function lum(p: Pixel): number {
  return 0.299 * p.r + 0.587 * p.g + 0.114 * p.b
}

function toHex(p: Pixel): string {
  const c = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${c(p.r)}${c(p.g)}${c(p.b)}`
}

function emptyMetrics(): PatternMetrics {
  return { color_ratio: [], line_density: 0, ring_density: 0 }
}

// 两组成色色块的占比对齐比较，返回总变差距离 0~1
export function ratioDistance(
  a: { color: string; ratio: number }[],
  b: { color: string; ratio: number }[]
): number {
  const map = new Map<string, number>()
  a.forEach((c) => map.set(c.color, c.ratio))
  let diff = 0
  const matched = new Set<string>()
  b.forEach((c) => {
    const nearestColor = nearestColorKey(c.color, [...map.keys()])
    matched.add(nearestColor)
    diff += Math.abs(c.ratio - (map.get(nearestColor) ?? 0))
  })
  map.forEach((v, key) => {
    if (!matched.has(key)) diff += v
  })
  return clamp(diff / 2, 0, 1)
}

function nearestColorKey(hex: string, keys: string[]): string {
  if (keys.length === 0) return hex
  let best = keys[0]
  let bestD = Infinity
  for (const k of keys) {
    const d = colorDist(hex, k)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

function colorDist(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255)
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255)
  const db = (pa & 255) - (pb & 255)
  return dr * dr + dg * dg + db * db
}
