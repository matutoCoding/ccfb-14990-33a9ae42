// 确定性随机与几何工具，所有推演只允许走这里的随机源

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 字符串种子转 32 位整数
export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// #rrggbb -> 0~1 线性分量
export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgb01ToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// 两点距离
export function dist2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return dx * dx + dy * dy
}

// 折线按固定步长重采样，保证不同设备/帧率产生同一序列
export function resamplePath(points: { x: number; y: number; p: number }[], step_mm: number) {
  const out: { x: number; y: number; p: number }[] = []
  if (points.length === 0) return out
  out.push({ ...points[0] })
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const seg = Math.sqrt(dist2(a.x, a.y, b.x, b.y))
    if (seg < 1e-6) continue
    let d = -carry
    while (d + step_mm <= seg) {
      d += step_mm
      const t = d / seg
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        p: a.p + (b.p - a.p) * t
      })
    }
    carry = seg - Math.max(d, 0)
  }
  return out
}
