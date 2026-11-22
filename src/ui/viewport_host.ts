// 共享视口宿主：画布 + 视角/显示模式/灯光工具条
import type { LightPreset, OverlayMode, ViewMode, Work } from '../core/types'
import { h } from './dom'
import { icon, type IconName } from './icons'
import { ensureController, startRenderLoop } from '../state/sim_context'
import type { SimController } from '../webgl/sim_controller'

export interface ViewportHostOptions {
  allowGrindPick?: boolean
  onController?: (c: SimController) => void
}

export async function createViewportHost(
  parent: HTMLElement,
  work: Work,
  opts: ViewportHostOptions = {}
): Promise<SimController> {
  const wrap = h('div', { class: 'viewport-wrap' })
  const canvas = document.createElement('canvas')
  wrap.append(canvas)

  const tools = h('div', { class: 'view-tools' })
  const hud = h('div', { class: 'view-hud' })
  wrap.append(tools, hud)
  parent.append(wrap)

  const controller = await ensureController(canvas, work)
  startRenderLoop()
  opts.onController?.(controller)

  const vp = controller.viewport
  const toolBtn = (name: IconName, label: string, active: boolean, onClick: () => void) =>
    h(
      'button',
      { class: active ? 'icon-btn active' : 'icon-btn', title: label, onclick: onClick },
      icon(name, 18)
    )

  // 视角切换
  const orbitBtn = toolBtn('cube', '立体视角', vp.camera.mode === 'orbit', () => {
    vp.setMode('orbit')
    sync()
  })
  const topBtn = toolBtn('eye', '俯视（研磨）', vp.camera.mode === 'top', () => {
    vp.setMode('top')
    sync()
  })
  const resetBtn = toolBtn('reset', '复位视角', false, () => {
    vp.resetView()
    sync()
  })
  tools.append(orbitBtn, topBtn, resetBtn)

  // 显示模式
  const modes: { value: ViewMode; text: string }[] = [
    { value: 'lacquer', text: '漆面' },
    { value: 'relief', text: '起底' },
    { value: 'heatmap', text: '热力' }
  ]
  const modeSeg = h(
    'div',
    { class: 'seg' },
    ...modes.map((m) =>
      h(
        'button',
        {
          class: vp.opts.viewMode === m.value ? 'active' : '',
          onclick: () => {
            vp.opts.viewMode = m.value
            vp.invalidate()
            sync()
          }
        },
        m.text
      )
    )
  )
  hud.append(modeSeg)

  // 叠加预警
  const overlays: { value: OverlayMode; text: string }[] = [
    { value: 'none', text: '关闭' },
    { value: 'alert', text: '穿帮' },
    { value: 'heatmap', text: '薄漆' },
    { value: 'both', text: '全开' }
  ]
  const overlaySeg = h(
    'div',
    { class: 'seg' },
    ...overlays.map((o) =>
      h(
        'button',
        {
          class: vp.opts.overlay === o.value ? 'active' : '',
          onclick: () => {
            vp.opts.overlay = o.value
            vp.invalidate()
            sync()
          }
        },
        o.text
      )
    )
  )
  hud.append(overlaySeg)

  // 灯光预设
  const lights: { value: LightPreset; text: string }[] = [
    { value: 'studio', text: '影棚' },
    { value: 'warm', text: '暖光' },
    { value: 'daylight', text: '天光' }
  ]
  const lightSeg = h(
    'div',
    { class: 'seg' },
    ...lights.map((l) =>
      h(
        'button',
        {
          class: vp.opts.light === l.value ? 'active' : '',
          onclick: () => {
            vp.opts.light = l.value
            vp.invalidate()
            sync()
          }
        },
        l.text
      )
    )
  )
  hud.append(lightSeg)

  function sync() {
    orbitBtn.classList.toggle('active', vp.camera.mode === 'orbit')
    topBtn.classList.toggle('active', vp.camera.mode === 'top')
    modeSeg.querySelectorAll('button').forEach((btn, i) => {
      btn.classList.toggle('active', vp.opts.viewMode === modes[i].value)
    })
    overlaySeg.querySelectorAll('button').forEach((btn, i) => {
      btn.classList.toggle('active', vp.opts.overlay === overlays[i].value)
    })
    lightSeg.querySelectorAll('button').forEach((btn, i) => {
      btn.classList.toggle('active', vp.opts.light === lights[i].value)
    })
  }
  sync()

  return controller
}
