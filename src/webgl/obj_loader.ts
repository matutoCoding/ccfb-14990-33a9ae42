// 极简 OBJ 解析器：支持 v / f（三角与多边形面），按外接盒归一到推演域
// 栅格化在 CPU 做正交投影取顶高，适合规则胎体；复杂异形会在导入提示中说明

export interface ObjMesh {
  vertices: Float32Array
  // 三角形索引
  triangles: Uint32Array
  domain_mm: number
}

export function parseObj(text: string, targetDiameterMm: number): ObjMesh {
  const verts: number[] = []
  const tris: number[] = []
  const face: number[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    if (parts[0] === 'v') {
      verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]))
      face.length = 0
    } else if (parts[0] === 'f') {
      const ids: number[] = []
      for (let i = 1; i < parts.length; i++) {
        // 支持 v、v/vt、v/vt/vn、v//vn
        const id = parseInt(parts[i].split('/')[0], 10)
        ids.push(id > 0 ? id - 1 : verts.length / 3 + id)
      }
      for (let i = 1; i < ids.length - 1; i++) {
        tris.push(ids[0], ids[i], ids[i + 1])
      }
    }
  }

  if (verts.length === 0 || tris.length === 0) {
    throw new Error('OBJ 中未读到有效顶点或面')
  }

  // 外接盒居中并按 XY 最大边等比缩放到目标直径
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < verts.length; i += 3) {
    minX = Math.min(minX, verts[i])
    maxX = Math.max(maxX, verts[i])
    minY = Math.min(minY, verts[i + 1])
    maxY = Math.max(maxY, verts[i + 1])
    minZ = Math.min(minZ, verts[i + 2])
    maxZ = Math.max(maxZ, verts[i + 2])
  }
  const scale = targetDiameterMm / Math.max(maxX - minX, maxY - minY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const out = new Float32Array(verts.length)
  for (let i = 0; i < verts.length; i += 3) {
    out[i] = (verts[i] - cx) * scale
    out[i + 1] = (verts[i + 1] - cy) * scale
    out[i + 2] = (verts[i + 2] - minZ) * scale
  }

  return {
    vertices: out,
    triangles: new Uint32Array(tris),
    domain_mm: targetDiameterMm * 1.02
  }
}

// 正交俯视栅格化：每个像素取覆盖三角形的最高 z，输出 RGBA（r=高度, a=蒙版）
export function rasterizeTop(mesh: ObjMesh, resolution: number): Float32Array {
  const rgba = new Float32Array(resolution * resolution * 4)
  const half = mesh.domain_mm / 2
  const { vertices, triangles } = mesh

  const toPx = (wx: number, wy: number) => [
    ((wx + half) / mesh.domain_mm) * (resolution - 1),
    ((wy + half) / mesh.domain_mm) * (resolution - 1)
  ]

  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t] * 3
    const i1 = triangles[t + 1] * 3
    const i2 = triangles[t + 2] * 3
    const [x0, y0] = toPx(vertices[i0], vertices[i0 + 1])
    const [x1, y1] = toPx(vertices[i1], vertices[i1 + 1])
    const [x2, y2] = toPx(vertices[i2], vertices[i2 + 1])
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
    const maxX = Math.min(resolution - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
    const maxY = Math.min(resolution - 1, Math.ceil(Math.max(y0, y1, y2)))
    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if (Math.abs(denom) < 1e-9) continue

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
        const b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
        const c = 1 - a - b
        if (a < 0 || b < 0 || c < 0) continue
        const z =
          a * vertices[i0 + 2] + b * vertices[i1 + 2] + c * vertices[i2 + 2]
        const idx = py * resolution + px
        if (rgba[idx * 4 + 3] === 0 || z > rgba[idx * 4]) {
          rgba[idx * 4] = z
          rgba[idx * 4 + 3] = 1
        }
      }
    }
  }
  return rgba
}
