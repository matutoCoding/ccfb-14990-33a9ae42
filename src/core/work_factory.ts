// 新建作品的默认工艺参数
import type { BodyParams, ReliefParams, Work } from './types'
import { DEFAULT_SIM_RESOLUTION, uid } from './types'

export function createWork(name: string, orderNo: string): Work {
  const now = Date.now()
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
    seed: now % 100000,
    stretch: 1.6
  }
  return {
    id: uid('wk'),
    name,
    order_no: orderNo,
    note: '',
    created_at: now,
    updated_at: now,
    body,
    relief,
    layers: [
      {
        id: uid('ly'),
        name: '黑底漆',
        color: '#1a1411',
        thickness_mm: 0.5,
        dry_days: 7,
        shrink: 0.08,
        flow: 0.6
      }
    ],
    operations: [],
    sim_resolution: DEFAULT_SIM_RESOLUTION,
    reference_id: null,
    version: 1
  }
}
