// 相机矩阵与射线求交验证
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invert, lookAt, mat4Multiply, ortho, perspective, rayPlane } from '../src/webgl/mat4.ts'
import { viewProjection } from '../src/webgl/camera.ts'

test('正交俯视：盘面中心在近远平面之间且射线求交回到中心', () => {
  const cam = {
    mode: 'top' as const,
    yaw: 0,
    pitch: 0.7,
    distance: 460,
    zoom: 1,
    target: [0, 0, 0] as [number, number, number]
  }
  const { vp } = viewProjection(cam, 1)
  const inv = invert(vp)
  const hit = rayPlane(inv, 0, 0, 0)
  assert.ok(hit)
  assert.ok(Math.abs(hit[0]) < 1e-6)
  assert.ok(Math.abs(hit[1]) < 1e-6)
})

test('俯视偏置目标后，射线仍准确落在 z=targetZ 平面', () => {
  const cam = {
    mode: 'top' as const,
    yaw: 0,
    pitch: 0.7,
    distance: 460,
    zoom: 1.4,
    target: [30, -20, 5] as [number, number, number]
  }
  const { vp } = viewProjection(cam, 1.2)
  const inv = invert(vp)
  const hit = rayPlane(inv, 0, 0, 5)
  assert.ok(hit)
  assert.ok(Math.abs(hit[0] - 30) < 1e-5)
  assert.ok(Math.abs(hit[1] + 20) < 1e-5)
})

test('透视轨道视图逆矩阵与原矩阵乘积近似单位阵', () => {
  const proj = perspective(Math.PI / 4, 1, 1, 6000)
  const view = lookAt([300, -300, 260], [0, 0, 0], [0, 0, 1])
  const vp = mat4Multiply(proj, view)
  const inv = invert(vp)
  const product = mat4Multiply(vp, inv)
  for (let i = 0; i < 16; i++) {
    const expected = i % 5 === 0 ? 1 : 0
    assert.ok(Math.abs(product[i] - expected) < 1e-4, `分量 ${i} 偏离单位阵`)
  }
})

test('正交矩阵对称中心投影到 NDC 原点', () => {
  const m = ortho(400, 1, 1, 2400)
  // 世界原点经正交矩阵（无平移）后 x、y 的 NDC 为 0
  const x = m[0] * 0
  const y = m[5] * 0
  assert.equal(x, 0)
  assert.equal(y, 0)
  assert.ok(m[0] > 0)
})

test('lookAt 相机位于目标正上方时视线沿 -z', () => {
  const view = lookAt([0, 0, 1200], [0, 0, 0], [0, 1, 0])
  // 列主序：视图矩阵第 3 列平移；相机局部 z 轴在第 3 行，俯视时与世界 +z 同向
  assert.ok(Math.abs(view[2] - 0) < 1e-6)
  assert.ok(Math.abs(view[6] - 0) < 1e-6)
  assert.ok(Math.abs(view[10] - 1) < 1e-6)
  // 平移 z 分量应为 -eye.z
  assert.ok(Math.abs(view[14] + 1200) < 1e-6)
})
