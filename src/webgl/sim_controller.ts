// 模拟编排器：一个作品对应一套 GL 资源，任何参数变更都从头确定性重建
import type { GrindOperation, Work } from '../core/types'
import { buildRelief } from '../core/relief'
import { domainSize } from '../core/shapes'
import { createGl } from './gl_util'
import { getObjCache, saveObjCache } from '../db/idb'
import { parseObj, rasterizeTop } from './obj_loader'
import { Simulation } from './sim_engine'
import { Viewport } from './viewport'

export class SimController {
  canvas: HTMLCanvasElement
  sim: Simulation
  viewport: Viewport
  private workId: string

  private constructor(canvas: HTMLCanvasElement, sim: Simulation, viewport: Viewport, workId: string) {
    this.canvas = canvas
    this.sim = sim
    this.viewport = viewport
    this.workId = workId
  }

  static async create(canvas: HTMLCanvasElement, work: Work): Promise<SimController> {
    const gl = createGl(canvas)
    const sim = new Simulation(gl, work.sim_resolution)
    await applyBody(sim, work)
    sim.rebuildLayers(work)
    sim.replayAll(work.operations)
    const viewport = new Viewport(canvas, sim, work)
    return new SimController(canvas, sim, viewport, work.id)
  }

  get currentWorkId() {
    return this.workId
  }

  // 胎体/起底变化：重建高度场与全部漆层，再重放研磨
  async rebuildBody(work: Work) {
    await applyBody(this.sim, work)
    this.sim.rebuildLayers(work)
    this.sim.replayAll(work.operations)
    this.viewport.replaceMesh(work)
    this.viewport.invalidate()
  }

  // 漆层变化：重算层堆叠与研磨
  rebuildCoat(work: Work) {
    this.sim.rebuildLayers(work)
    this.sim.replayAll(work.operations)
    this.viewport.invalidate()
  }

  // 研磨变化：只需从层顶重放操作
  replay(work: Work, step?: number) {
    if (step === undefined) {
      this.sim.replayAll(work.operations)
    } else {
      this.sim.replayTo(work.operations, step)
    }
    this.viewport.invalidate()
  }

  // 实时下刀：先重放已存档操作，再在当前 G 上叠加试算一刀
  previewOperation(work: Work, op: GrindOperation) {
    this.sim.replayAll(work.operations)
    this.sim.applyOne(op)
    this.viewport.invalidate()
  }

  pierceRatio(work: Work): number {
    void work
    return this.sim.pierceRatio()
  }
}

async function applyBody(sim: Simulation, work: Work) {
  const domain = domainSize(work.body)
  if (work.body.obj_id) {
    const cached = await getObjCache(work.body.obj_id)
    if (cached && cached.resolution === work.sim_resolution) {
      sim.uploadObjBase(cached.rgba, cached.domain_mm)
      return
    }
    throw new Error('OBJ 缓存缺失，请在胎体页重新导入')
  }
  const field = buildRelief(work.body, work.relief, work.sim_resolution)
  sim.uploadBase(field, domain)
}

// 读取 OBJ 文件并栅格化入库，返回缓存 id
export async function importObjToCache(
  file: File,
  work: Work
): Promise<{ id: string; domain_mm: number }> {
  const text = await file.text()
  const mesh = parseObj(text, work.body.diameter_mm)
  const rgba = rasterizeTop(mesh, work.sim_resolution)
  const id = `obj_${work.id}_${Date.now().toString(36)}`
  await saveObjCache({
    id,
    source_name: file.name,
    rgba,
    domain_mm: mesh.domain_mm,
    resolution: work.sim_resolution
  })
  return { id, domain_mm: mesh.domain_mm }
}

export function describeOperation(op: GrindOperation): string {
  return op.tool.type === 'planar'
    ? `平台下磨 ${op.planar_depth_mm.toFixed(2)}mm`
    : `${op.tool.name} × ${op.samples.length} 触点`
}
