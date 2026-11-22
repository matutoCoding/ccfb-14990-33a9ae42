// 层厚物理模型 CPU 参考实现，与 DEPOSIT_FS 着色器公式严格对应
// 用于无 GPU 环境验证：凸顶流薄、凹处积厚、单调性与确定性
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clamp } from '../src/core/math_util.ts'

// 与 shaders.ts 中 DEPOSIT_FS 同一公式
export function depositThickness(
  nominal: number,
  flow: number,
  lap: number,
  slope: number
): number {
  const kNorm = clamp(-lap / (nominal * 3 + 0.02), -1, 1)
  const slopeNorm = clamp(slope / (nominal * 4 + 0.03), 0, 1)
  const factor = clamp(1 - flow * kNorm - 0.3 * flow * slopeNorm, 0.35, 1.9)
  return nominal * factor
}

// 简化高度场：余弦鼓包，凸顶 lap<0、凹处 lap>0
function makeBumpField(size: number, period: number, amp: number) {
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      h[y * size + x] = amp * Math.cos((x / period) * Math.PI * 2) * Math.cos((y / period) * Math.PI * 2)
    }
  }
  return h
}

test('凸顶流薄：鼓包顶点厚度低于名义值', () => {
  const size = 64
  const period = 16
  const field = makeBumpField(size, period, 0.8)
  const nominal = 0.4
  const flow = 0.7
  // 余弦场首个凸顶位于 (period/2, period/2)
  const cx = period / 2
  const cy = period / 2
  const idx = cy * size + cx
  const lap =
    field[idx + 1] + field[idx - 1] + field[idx + size] + field[idx - size] - 4 * field[idx]
  const t = depositThickness(nominal, flow, lap, 0)
  assert.ok(lap < 0, '鼓包顶拉普拉斯应为负')
  assert.ok(t < nominal, `凸顶厚度 ${t} 应薄于名义 ${nominal}`)
})

test('凹处积厚：谷底厚度高于名义值', () => {
  const size = 64
  const period = 16
  const field = makeBumpField(size, period, 0.8)
  const nominal = 0.4
  const flow = 0.7
  // 数值扫描找拉普拉斯最大的真谷底，避开边界
  let idx = -1
  let bestLap = -Infinity
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x
      const lap = field[i + 1] + field[i - 1] + field[i + size] + field[i - size] - 4 * field[i]
      if (lap > bestLap) {
        bestLap = lap
        idx = i
      }
    }
  }
  const t = depositThickness(nominal, flow, bestLap, 0)
  assert.ok(bestLap > 0, '谷底拉普拉斯应为正')
  assert.ok(t > nominal, `谷底厚度 ${t} 应厚于名义 ${nominal}`)
})

test('平地厚度等于名义值', () => {
  const t = depositThickness(0.4, 0.7, 0, 0)
  assert.ok(Math.abs(t - 0.4) < 1e-9)
})

test('流挂系数越大凸凹差异越明显', () => {
  const period = 16
  const field = makeBumpField(64, period, 0.8)
  const idx = (period / 2) * 64 + period / 2
  const lap =
    field[idx + 1] + field[idx - 1] + field[idx + 64] + field[idx - 64] - 4 * field[idx]
  const weak = depositThickness(0.4, 0.2, lap, 0)
  const strong = depositThickness(0.4, 1.0, lap, 0)
  assert.ok(strong < weak)
})

test('厚度始终落在安全区间，不会出现负厚度', () => {
  for (let lap = -2; lap <= 2; lap += 0.1) {
    for (let slope = 0; slope <= 1; slope += 0.1) {
      const t = depositThickness(0.3, 0.8, lap, slope)
      assert.ok(t > 0)
      assert.ok(t <= 0.3 * 1.9 + 1e-9)
    }
  }
})

test('逐层堆叠单调不减且同输入同输出', () => {
  const size = 32
  const field = makeBumpField(size, 8, 0.6)
  const layers = Array.from({ length: 8 }, (_, i) => ({
    nominal: 0.35,
    flow: 0.7,
    shrink: 0.08
  }))
  const run = () => {
    const surface = new Float32Array(field)
    const record: number[] = []
    for (const layer of layers) {
      const eff = layer.nominal * (1 - layer.shrink)
      for (let i = size + 1; i < size * size - size - 1; i++) {
        const lap = surface[i + 1] + surface[i - 1] + surface[i + size] + surface[i - size] - 4 * surface[i]
        const slope = Math.abs(surface[i + 1] - surface[i - 1]) * 0.5
        surface[i] += depositThickness(eff, layer.flow, lap, slope)
      }
      record.push(surface[Math.floor(size / 2) * size + Math.floor(size / 2)])
    }
    return record
  }
  const a = run()
  const b = run()
  assert.deepEqual(a, b)
  for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1])
})

test('收缩率线性作用于有效名义厚度', () => {
  const noShrink = depositThickness(0.4, 0, 0, 0)
  const shrink10 = depositThickness(0.4 * 0.9, 0, 0, 0)
  assert.ok(Math.abs(shrink10 - noShrink * 0.9) < 1e-9)
})
