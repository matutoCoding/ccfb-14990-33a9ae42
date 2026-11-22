// 参数化胎体：盘、盒、碗。所有形状映射到同一方形推演域，物理边长 = domainSize
import type { BodyParams, ShapeType } from './types'

export interface ShapeProfile {
  // 推演域物理边长，毫米
  domain_mm: number
  // 给定域内归一化坐标 (u,v ∈ [-1,1])，返回裸胎顶面高度 z，毫米
  heightAt: (u: number, v: number) => number
  // 该点是否属于胎体顶面（决定网格与蒙版）
  maskAt: (u: number, v: number) => boolean
}

export function domainSize(body: BodyParams): number {
  // OBJ 外接盒按直径等比缩放，留 2% 边距
  return body.obj_id ? body.diameter_mm * 1.02 : body.diameter_mm
}

export function shapeProfile(body: BodyParams): ShapeProfile {
  const h = body.height_mm
  const wall = body.wall_mm
  void wall

  const radial = (u: number, v: number) => Math.sqrt(u * u + v * v)

  if (body.shape === 'plate') {
    // 浅腹盘：中心微凹，距边 15% 处起翘成唇边
    return {
      domain_mm: domainSize(body),
      maskAt: (u, v) => radial(u, v) <= 1,
      heightAt: (u, v) => {
        const q = radial(u, v)
        const rim = smoothstep(0.72, 1, q)
        const well = -wall * 0.6 * (1 - smoothstep(0, 0.72, q))
        return well + h * rim * rim
      }
    }
  }

  if (body.shape === 'bowl') {
    // 碗：球面弧腹，边缘最高
    return {
      domain_mm: domainSize(body),
      maskAt: (u, v) => radial(u, v) <= 1,
      heightAt: (u, v) => {
        const q = Math.min(1, radial(u, v))
        const curve = 1 - Math.sqrt(Math.max(0, 1 - q * q))
        return h * curve
      }
    }
  }

  // 盒：平面顶面 + 圆角收边
  const corner = Math.min(0.22, (wall * 2) / body.diameter_mm + 0.08)
  return {
    domain_mm: domainSize(body),
    maskAt: (u, v) => Math.max(Math.abs(u), Math.abs(v)) <= 1,
    heightAt: (u, v) => {
      const q = Math.max(Math.abs(u), Math.abs(v))
      return h * smoothstep(1 - corner, 1, q)
    }
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export const SHAPE_LABELS: Record<ShapeType, string> = {
  plate: '茶盘',
  box: '捧盒',
  bowl: '漆碗'
}
