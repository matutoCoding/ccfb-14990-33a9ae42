// 打磨推演页：实时下刀 / 平台磨 / 逐操作回放定位 / 磨穿预警
import type { GrindOperation, GrindTool, ToolType } from '../core/types'
import { TOOL_PRESETS, uid } from '../core/types'
import { h, clear, segmented, slider, toast } from '../ui/dom'
import { icon } from '../ui/icons'
import { workStore } from '../state/store'
import { createViewportHost } from '../ui/viewport_host'
import { resamplePath } from '../core/math_util'
import { describeOperation } from '../webgl/sim_controller'

interface DraftTool {
  type: ToolType
  diameter_mm: number
  pressure: number
  hardness: number
}

export async function renderGrindPage(root: HTMLElement): Promise<void> {
  clear(root)
  const work = workStore.current
  if (!work) return
  const current = work

  const viewCol = h('div', {})
  const panel = h('div', { class: 'stack' })
  root.append(h('div', { class: 'grid-2' }, viewCol, panel))

  const controller = await createViewportHost(viewCol, current)
  controller.viewport.setMode('top')
  controller.viewport.opts.overlay = 'both'
  controller.viewport.invalidate()

  const draft: DraftTool = {
    type: 'disc',
    diameter_mm: TOOL_PRESETS[1].diameter_mm,
    pressure: TOOL_PRESETS[1].pressure,
    hardness: TOOL_PRESETS[1].hardness
  }
  let rawPath: { x: number; y: number; p: number }[] = []
  let drawing = false
  let replayStep = current.operations.length - 1

  const metricsCard = h('div', { class: 'card' })
  const toolCard = h('div', { class: 'card' })
  const opsCard = h('div', { class: 'card' })

  function refreshMetrics() {
    const ratio = controller.pierceRatio(current)
    metricsCard.replaceChildren(
      h('div', { class: 'card-title' }, '打磨状态'),
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between' },
        h('span', { class: 'muted' }, '已存档磨次'),
        h('strong', {}, String(current.operations.length))
      ),
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between;margin-top:12px' },
        h('span', { class: 'muted' }, '磨穿面积占比'),
        h('span', { class: ratio > 0 ? 'badge alert' : 'badge' }, `${(ratio * 100).toFixed(2)}%`)
      ),
      h(
        'p',
        { class: 'muted', style: 'margin-top:12px;line-height:1.6' },
        '红色为已磨穿到胎体，橙色热力区表示剩余漆厚低于阈值。俯视模式下按住拖动即可下刀。'
      )
    )
  }

  function buildToolCard() {
    toolCard.replaceChildren(
      h('div', { class: 'card-title' }, '磨具与下压力度'),
      segmented<ToolType>(
        [
          { value: 'planar', text: '水磨平台' },
          { value: 'disc', text: '木炭圆磨' },
          { value: 'stick', text: '磨石条' }
        ],
        draft.type,
        (v) => {
          const preset = TOOL_PRESETS.find((t) => t.type === v) ?? TOOL_PRESETS[1]
          draft.type = v
          draft.diameter_mm = preset.diameter_mm
          draft.pressure = preset.pressure
          draft.hardness = preset.hardness
          buildToolCard()
        }
      )
    )

    if (draft.type === 'planar') {
      toolCard.append(
        slider('单次平台下磨量', {
          min: 0.02,
          max: 1,
          step: 0.01,
          value: 0.25,
          unit: 'mm',
          onInput: (v) => (planarDepth = v)
        }),
        slider('平台压力', {
          min: 0.1,
          max: 1,
          step: 0.05,
          value: draft.pressure,
          onInput: (v) => (draft.pressure = v)
        }),
        h(
          'button',
          {
            class: 'btn primary',
            style: 'width:100%',
            onclick: () => commitPlanar()
          },
          icon('grind', 16),
          '执行一次平台磨'
        )
      )
    } else {
      toolCard.append(
        slider('磨具直径', {
          min: 4,
          max: 80,
          step: 1,
          value: draft.diameter_mm,
          unit: 'mm',
          onInput: (v) => (draft.diameter_mm = v)
        }),
        slider('下压力度', {
          min: 0.1,
          max: 1,
          step: 0.05,
          value: draft.pressure,
          onInput: (v) => (draft.pressure = v)
        }),
        slider('磨具硬度', {
          min: 0.2,
          max: 1,
          step: 0.05,
          value: draft.hardness,
          onInput: (v) => (draft.hardness = v)
        }),
        h(
          'button',
          {
            class: 'btn primary',
            style: 'width:100%',
            onclick: () => commitStroke()
          },
          icon('plus', 16),
          '存档当前走刀'
        ),
        h(
          'button',
          {
            class: 'btn',
            style: 'width:100%',
            onclick: () => discardStroke()
          },
          '放弃走刀'
        )
      )
    }
    toolCard.append(
      slider('薄漆热力阈值', {
        min: 0.05,
        max: 0.8,
        step: 0.01,
        value: controller.viewport.opts.heatThreshold,
        unit: 'mm',
        onInput: (v) => {
          controller.viewport.opts.heatThreshold = v
          controller.viewport.invalidate()
        }
      })
    )
  }

  let planarDepth = 0.25

  function currentTool(): GrindTool {
    const preset = TOOL_PRESETS.find((t) => t.type === draft.type) ?? TOOL_PRESETS[1]
    return {
      type: draft.type,
      name: preset.name,
      diameter_mm: draft.diameter_mm,
      pressure: draft.pressure,
      hardness: draft.hardness
    }
  }

  function commitPlanar() {
    const op: GrindOperation = {
      id: uid('op'),
      label: `平台磨 ${planarDepth.toFixed(2)}mm`,
      tool: currentTool(),
      planar_depth_mm: planarDepth,
      samples: [],
      step_mm: 4,
      created_at: Date.now()
    }
    workStore.mutate((w) => w.operations.push(op))
    replayStep = current.operations.length - 1
    controller.replay(current)
    void workStore.saveNow()
    refreshMetrics()
    renderOps()
    toast('平台磨已存档')
  }

  function commitStroke() {
    if (rawPath.length < 2) {
      toast('先在俯视区按住拖动走刀')
      return
    }
    const samples = resamplePath(rawPath, 4)
    const op: GrindOperation = {
      id: uid('op'),
      label: `${currentTool().name} 走刀`,
      tool: currentTool(),
      planar_depth_mm: 0,
      samples,
      step_mm: 4,
      created_at: Date.now()
    }
    workStore.mutate((w) => w.operations.push(op))
    rawPath = []
    replayStep = current.operations.length - 1
    controller.replay(current)
    void workStore.saveNow()
    refreshMetrics()
    renderOps()
    toast(`走刀已存档，重采样为 ${samples.length} 个确定性触点`)
  }

  function discardStroke() {
    rawPath = []
    controller.replay(current, replayStep)
  }

  function renderOps() {
    opsCard.replaceChildren(h('div', { class: 'card-title' }, '磨次回放定位'))
    if (current.operations.length === 0) {
      opsCard.append(h('p', { class: 'muted' }, '还没有磨次，下第一刀试试。'))
      return
    }
    current.operations.forEach((op, i) => {
      opsCard.append(
        h(
          'div',
          {
            class: 'row',
            style: `justify-content:space-between;padding:10px 12px;border-radius:var(--radius);cursor:pointer;background:${
              i === replayStep ? 'var(--c-primary-soft)' : 'transparent'
            }`,
            onclick: () => {
              replayStep = i
              controller.replay(current, i)
              refreshMetrics()
              renderOps()
            }
          },
          h('div', {}, h('strong', { style: 'font-size:14px' }, `#${i + 1} ${op.label}`), h('div', { class: 'muted' }, describeOperation(op))),
          h(
            'button',
            {
              class: 'btn sm danger',
              onclick: (e: Event) => {
                e.stopPropagation()
                workStore.mutate((w) => w.operations.splice(i, 1))
                replayStep = Math.min(replayStep, current.operations.length - 1)
                controller.replay(current)
                void workStore.saveNow()
                refreshMetrics()
                renderOps()
              }
            },
            icon('trash', 14)
          )
        )
      )
    })
    opsCard.append(
      h(
        'button',
        {
          class: 'btn',
          style: 'width:100%;margin-top:12px',
          onclick: () => {
            replayStep = current.operations.length - 1
            controller.replay(current)
            renderOps()
          }
        },
        icon('play', 15),
        '回到最终磨态'
      )
    )
  }

  // 实时走刀：定长采样后立刻作为试算操作上 GPU
  controller.viewport.onPointerWorld = (x, y, p) => {
    if (draft.type === 'planar') return
    const half = controller.sim.domain / 2
    if (Math.hypot(x, y) > half) return
    if (!drawing) {
      drawing = true
      rawPath = []
    }
    rawPath.push({ x, y, p: Math.max(0.15, p) })
    const samples = resamplePath(rawPath, 4)
    const op: GrindOperation = {
      id: 'draft',
      label: 'draft',
      tool: currentTool(),
      planar_depth_mm: 0,
      samples,
      step_mm: 4,
      created_at: 0
    }
    controller.previewOperation(current, op)
  }
  controller.canvas.addEventListener('pointerup', () => {
    drawing = false
  })
  controller.canvas.addEventListener('pointerleave', () => {
    drawing = false
  })

  buildToolCard()
  refreshMetrics()
  renderOps()
  panel.append(metricsCard, toolCard, opsCard)
}

export function toolSummary(tool: GrindTool): string {
  return `${tool.name} Φ${tool.diameter_mm}mm · 压力${Math.round(tool.pressure * 100)}%`
}
