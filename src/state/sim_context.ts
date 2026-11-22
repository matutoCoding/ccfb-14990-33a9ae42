// 共享模拟上下文：每个作品一个 SimController，切换作品时释放 GL 资源
import type { Work } from '../core/types'
import { SimController } from '../webgl/sim_controller'

let current: SimController | null = null
const glCanvases = new Set<HTMLCanvasElement>()
let loopStarted = false

export async function ensureController(canvas: HTMLCanvasElement, work: Work): Promise<SimController> {
  if (current && current.currentWorkId === work.id) {
    return current
  }
  disposeController()
  current = await SimController.create(canvas, work)
  glCanvases.add(canvas)
  return current
}

export function getController(): SimController | null {
  return current
}

export function disposeController(): void {
  const lose = current?.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
  lose?.loseContext()
  glCanvases.forEach((c) => c.remove())
  glCanvases.clear()
  current = null
  loopStarted = false
}

// 持续渲染循环：每帧取当前视口，脏标记跳过空闲帧，保证 40cm 盘交互流畅
export function startRenderLoop(): void {
  if (loopStarted) return
  loopStarted = true
  const tick = () => {
    getController()?.viewport.render()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
