// 预置样例作品：参数与研磨路径全部种子化，首次启动写入 IndexedDB
import type {
  GrindOperation,
  GrindSample,
  LacquerLayer,
  ReliefParams,
  Work
} from '../core/types'
import { TOOL_PRESETS, uid } from '../core/types'
import { hashSeed, mulberry32 } from '../core/math_util'

const RED = '#8e1c12'
const DARK = '#1a1411'
const YELLOW = '#d9a441'

function layer(name: string, color: string, thickness: number, flow = 0.7, shrink = 0.08): LacquerLayer {
  return {
    id: uid('ly'),
    name,
    color,
    thickness_mm: thickness,
    dry_days: 7,
    shrink,
    flow
  }
}

function relief(seed: number, mode: ReliefParams['mode'] = 'jittered'): ReliefParams {
  return {
    mode,
    density_per_cm2: 6,
    height_mm: 0.9,
    radius_mm: 7,
    jitter: 0.7,
    seed,
    stretch: 1.6
  }
}

// 按种子生成一组圆磨走刀：同心环 + 径向补刀，天然适配圆形胎体
function seededStrokes(seedText: string, rings: number, pressure: number): GrindOperation {
  const rng = mulberry32(hashSeed(seedText))
  const tool = { ...TOOL_PRESETS[1], pressure }
  const samples: GrindSample[] = []
  for (let r = 1; r <= rings; r++) {
    const radius = (r / (rings + 1)) * 175
    const steps = Math.max(24, Math.round((2 * Math.PI * radius) / 4))
    const phase = rng() * Math.PI
    for (let i = 0; i < steps; i++) {
      const a = phase + (i / steps) * Math.PI * 2
      samples.push({
        x: Math.cos(a) * radius + (rng() - 0.5) * 2,
        y: Math.sin(a) * radius + (rng() - 0.5) * 2,
        p: pressure
      })
    }
  }
  return {
    id: uid('op'),
    label: `圆磨环走 ${rings} 圈`,
    tool,
    planar_depth_mm: 0,
    samples,
    step_mm: 4,
    created_at: Date.now()
  }
}

function planar(label: string, depth: number, pressure = 0.35): GrindOperation {
  return {
    id: uid('op'),
    label,
    tool: { ...TOOL_PRESETS[0], pressure },
    planar_depth_mm: depth,
    samples: [],
    step_mm: 4,
    created_at: Date.now()
  }
}

export function seedWorks(): Work[] {
  const now = Date.now()
  const base = (partial: Partial<Work> & Pick<Work, 'name' | 'order_no' | 'body'>): Work => ({
    id: uid('wk'),
    note: '',
    created_at: now,
    updated_at: now,
    layers: [],
    operations: [],
    sim_resolution: 1024,
    reference_id: null,
    version: 1,
    relief: relief(hashSeed(partial.name)),
    ...partial
  })

  const classic: Work = base({
    name: '红黑黄经典茶盘',
    order_no: 'XP-2026-001',
    note: '三色轮转，犀皮入门经典样',
    body: { shape: 'plate', diameter_mm: 400, height_mm: 22, wall_mm: 8, obj_id: null },
    layers: [
      layer('黑底漆', DARK, 0.5, 0.5),
      layer('朱红漆', RED, 0.45),
      layer('金黄漆', YELLOW, 0.4),
      layer('黑面漆', DARK, 0.42)
    ],
    operations: [
      planar('平台初磨 0.3mm', 0.3),
      seededStrokes('classic-finish', 6, 0.5)
    ],
    relief: relief(hashSeed('classic'), 'hemp')
  })

  const finger: Work = base({
    name: '指捺纹捧盒',
    order_no: 'XP-2026-002',
    note: '手指捺出拉长凸点，纹如流云',
    body: { shape: 'box', diameter_mm: 300, height_mm: 60, wall_mm: 10, obj_id: null },
    layers: [
      layer('黑底漆', DARK, 0.5),
      layer('朱红漆', RED, 0.45),
      layer('金黄漆', YELLOW, 0.38),
      layer('朱红漆', RED, 0.4),
      layer('黑面漆', DARK, 0.4)
    ],
    operations: [
      planar('平台粗磨 0.35mm', 0.35),
      seededStrokes('finger-box', 5, 0.55)
    ],
    relief: { ...relief(hashSeed('finger'), 'finger'), density_per_cm2: 4, stretch: 2.4, height_mm: 1.1 }
  })

  const complex: Work = base({
    name: '八层流光漆碗',
    order_no: 'XP-2026-003',
    note: '八层薄髹，磨显层次最丰富的复杂款',
    body: { shape: 'bowl', diameter_mm: 260, height_mm: 90, wall_mm: 7, obj_id: null },
    layers: [
      layer('黑底漆', DARK, 0.42, 0.6, 0.07),
      layer('朱红漆', RED, 0.36),
      layer('金黄漆', YELLOW, 0.34, 0.75),
      layer('黑推光漆', DARK, 0.36),
      layer('朱红漆', RED, 0.34, 0.8),
      layer('金黄漆', YELLOW, 0.32),
      layer('黑推光漆', DARK, 0.34),
      layer('朱红面漆', RED, 0.36, 0.65)
    ],
    operations: [
      planar('平台粗磨 0.25mm', 0.25),
      planar('平台细磨 0.2mm', 0.2, 0.4),
      seededStrokes('complex-bowl-a', 4, 0.45),
      seededStrokes('complex-bowl-b', 3, 0.6)
    ],
    relief: { ...relief(hashSeed('complex'), 'jittered'), density_per_cm2: 8, height_mm: 0.8, radius_mm: 5.5 }
  })

  const ridge: Work = base({
    name: '棱脊麻籽圆盘',
    order_no: 'XP-2026-004',
    note: '稠漆起脊，色纹呈平行带状',
    body: { shape: 'plate', diameter_mm: 350, height_mm: 18, wall_mm: 8, obj_id: null },
    layers: [
      layer('黑底漆', DARK, 0.48),
      layer('金黄漆', YELLOW, 0.4),
      layer('朱红漆', RED, 0.42),
      layer('黑面漆', DARK, 0.4),
      layer('金黄面漆', YELLOW, 0.38),
      layer('黑封漆', DARK, 0.36)
    ],
    operations: [
      planar('平台磨 0.4mm', 0.4),
      seededStrokes('ridge-plate', 7, 0.5)
    ],
    relief: { ...relief(hashSeed('ridge'), 'ridge'), density_per_cm2: 5, height_mm: 1.0, stretch: 3 }
  })

  return [classic, finger, complex, ridge]
}
