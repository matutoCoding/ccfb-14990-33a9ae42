// 确定性与层厚模型验证：Node 内置测试运行器，node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashSeed, mulberry32, resamplePath } from '../src/core/math_util.ts'
import { buildRelief } from '../src/core/relief.ts'
import { shapeProfile } from '../src/core/shapes.ts'
import type { BodyParams, ReliefParams } from '../src/core/types.ts'

const body: BodyParams = {
  shape: 'plate',
  diameter_mm: 400,
  height_mm: 22,
  wall_mm: 8,
  obj_id: null
}

const relief: ReliefParams = {
  mode: 'jittered',
  density_per_cm2: 6,
  height_mm: 0.9,
  radius_mm: 7,
  jitter: 0.7,
  seed: 42,
  stretch: 1.6
}

test('mulberry32 同种子序列完全一致', () => {
  const a = mulberry32(12345)
  const b = mulberry32(12345)
  const seqA = Array.from({ length: 1000 }, a)
  const seqB = Array.from({ length: 1000 }, b)
  assert.deepEqual(seqA, seqB)
})

test('不同种子序列不同', () => {
  const a = mulberry32(1)
  const b = mulberry32(2)
  assert.notEqual(a(), b())
})

test('hashSeed 字符串种子稳定', () => {
  assert.equal(hashSeed('classic:42:hemp'), hashSeed('classic:42:hemp'))
  assert.notEqual(hashSeed('a'), hashSeed('b'))
})

test('路径定长重采样确定且等距', () => {
  const path = [
    { x: 0, y: 0, p: 0.5 },
    { x: 10, y: 0, p: 0.5 },
    { x: 20, y: 0, p: 0.5 }
  ]
  const r1 = resamplePath(path, 4)
  const r2 = resamplePath(path, 4)
  assert.deepEqual(r1, r2)
  // 相邻采样点间距应等于步长
  for (let i = 1; i < r1.length; i++) {
    const d = Math.hypot(r1[i].x - r1[i - 1].x, r1[i].y - r1[i - 1].y)
    assert.ok(Math.abs(d - 4) < 1e-9)
  }
  assert.ok(r1.length >= 5)
})

test('起底高度场同参数两次构建逐像素一致', () => {
  const f1 = buildRelief(body, relief, 256)
  const f2 = buildRelief(body, relief, 256)
  assert.equal(f1.heights.length, f2.heights.length)
  let diff = 0
  for (let i = 0; i < f1.heights.length; i++) {
    if (f1.heights[i] !== f2.heights[i]) diff++
  }
  assert.equal(diff, 0)
})

test('换种子产生不同纹样', () => {
  const f1 = buildRelief(body, relief, 256)
  const f2 = buildRelief(body, { ...relief, seed: 99 }, 256)
  let diff = 0
  for (let i = 0; i < f1.heights.length; i++) {
    if (f1.heights[i] !== f2.heights[i]) diff++
  }
  assert.ok(diff > 100)
})

test('域外高度严格清零、蒙版正确', () => {
  const field = buildRelief(body, relief, 256)
  for (let i = 0; i < field.mask.length; i++) {
    if (!field.mask[i]) assert.equal(field.heights[i], 0)
  }
  // 圆盘中心必然在域内
  const center = Math.floor(256 / 2) * 256 + Math.floor(256 / 2)
  assert.equal(field.mask[center], 1)
})

test('1024 网格起底构建在可接受耗时内', () => {
  const t0 = process.hrtime.bigint()
  const field = buildRelief(body, relief, 1024)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.ok(field.heights.length === 1024 * 1024)
  assert.ok(ms < 1500, `构建耗时 ${ms.toFixed(0)}ms 超出预算`)
})

test('胎体高度场确定且盒型为方形蒙版', () => {
  const plate = shapeProfile(body)
  const box = shapeProfile({ ...body, shape: 'box' })
  assert.equal(plate.maskAt(0, 0), true)
  assert.equal(plate.maskAt(0.99, 0), true)
  assert.equal(plate.maskAt(0, 0.99), true)
  // 盒型角点在域内，圆盘角点在域外
  assert.equal(box.maskAt(0.95, 0.95), true)
  assert.equal(plate.maskAt(0.95, 0.95), false)
  // 盘唇边高于中心
  assert.ok(plate.heightAt(0, 0.98) > plate.heightAt(0, 0))
})

test('四种起底模式都能生成非零高度场', () => {
  for (const mode of ['jittered', 'finger', 'hemp', 'ridge'] as const) {
    const field = buildRelief(body, { ...relief, mode }, 128)
    const nonzero = field.heights.some((v) => v > 0)
    assert.ok(nonzero, `${mode} 模式应产生凸点`)
  }
})
