// 参数化顶面网格 + 侧壁/封底，顶点 z 在着色器里按高度场位移
import type { BodyParams } from '../core/types'
import { shapeProfile } from '../core/shapes'

export interface MeshData {
  positions: Float32Array
  uvs: Float32Array
  topFlags: Float32Array
  indices: Uint32Array
  indexCount: number
}

export function buildMesh(body: BodyParams, resolution = 180): MeshData {
  const profile = shapeProfile(body)
  const positions: number[] = []
  const uvs: number[] = []
  const topFlags: number[] = []
  const indices: number[] = []
  const grid = resolution + 1
  const bottomZ = -Math.max(body.wall_mm, body.height_mm * 0.18)

  const topIndex = (x: number, y: number) => y * grid + x
  const bottomBase = grid * grid

  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const uvx = x / resolution
      const uvy = y / resolution
      const u = uvx * 2 - 1
      const v = uvy * 2 - 1
      positions.push(0, 0, profile.maskAt(u, v) ? profile.heightAt(u, v) : 0)
      uvs.push(uvx, uvy)
      topFlags.push(1)
    }
  }

  // 顶面三角形，域外顶点在片元阶段丢弃
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const a = topIndex(x, y)
      const b = topIndex(x + 1, y)
      const c = topIndex(x, y + 1)
      const d = topIndex(x + 1, y + 1)
      indices.push(a, b, d, a, d, c)
    }
  }

  // 封底：uv 固定 0，topFlag=0，走纯色不采样高度场
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const uvx = x / resolution
      const uvy = y / resolution
      positions.push(0, 0, bottomZ)
      uvs.push(uvx, uvy)
      topFlags.push(0)
    }
  }
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const a = bottomBase + topIndex(x, y)
      const b = bottomBase + topIndex(x + 1, y)
      const c = bottomBase + topIndex(x, y + 1)
      const d = bottomBase + topIndex(x + 1, y + 1)
      indices.push(a, d, b, a, c, d)
    }
  }

  // 侧壁：连接顶面边缘与封底边缘
  const edge = (x: number, y: number) => {
    const t = topIndex(x, y)
    const b = bottomBase + t
    indices.push(t, b)
    return [t, b]
  }
  for (let x = 0; x < resolution; x++) {
    const [t0, b0] = edge(x, 0)
    const [t1, b1] = edge(x + 1, 0)
    indices.push(t0, t1, b1, t0, b1, b0)
    const [t2, b2] = edge(x, resolution)
    const [t3, b3] = edge(x + 1, resolution)
    indices.push(t2, b3, t3, t2, b2, b3)
  }
  for (let y = 0; y < resolution; y++) {
    const [t0, b0] = edge(0, y)
    const [t1, b1] = edge(0, y + 1)
    indices.push(t0, b1, t1, t0, b0, b1)
    const [t2, b2] = edge(resolution, y)
    const [t3, b3] = edge(resolution, y + 1)
    indices.push(t2, t3, b3, t2, b3, b2)
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    topFlags: new Float32Array(topFlags),
    indices: new Uint32Array(indices),
    indexCount: indices.length
  }
}
