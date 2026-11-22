// 纹样比对页：参考照片 vs 推演结果，同算法量化色块与纹路密度
import type { PatternMetrics } from '../core/types'
import { uid } from '../core/types'
import { h, clear, toast } from '../ui/dom'
import { icon } from '../ui/icons'
import { workStore } from '../state/store'
import { createViewportHost } from '../ui/viewport_host'
import { analyzeCanvas, ratioDistance } from '../core/analysis'
import { deleteBlob, getBlob, saveBlob } from '../db/idb'

export async function renderComparePage(root: HTMLElement): Promise<void> {
  clear(root)
  const work = workStore.current
  if (!work) return

  const viewCol = h('div', {})
  const panel = h('div', { class: 'stack' })
  root.append(h('div', { class: 'grid-2' }, viewCol, panel))

  const current = work
  const controller = await createViewportHost(viewCol, current)
  controller.viewport.setMode('top')
  controller.viewport.opts.overlay = 'none'
  controller.viewport.invalidate()

  const refCard = h('div', { class: 'card' })
  const resultCard = h('div', { class: 'card' })
  const scoreCard = h('div', { class: 'card' })
  panel.append(refCard, resultCard, scoreCard)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.hidden = true
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const id = current.reference_id ?? uid('ref')
    await saveBlob(id, file)
    workStore.mutate((w) => (w.reference_id = id))
    await workStore.saveNow()
    renderRef()
  })

  let refMetrics: PatternMetrics | null = null
  let simMetrics: PatternMetrics | null = null

  async function renderRef() {
    refCard.replaceChildren(h('div', { class: 'card-title' }, '客户参考照片'))
    if (!current.reference_id) {
      refCard.append(
        h(
          'div',
          { class: 'empty-state' },
          icon('upload', 36),
          h('div', { class: 'empty-title' }, '尚未上传参考照片'),
          h('div', { class: 'empty-sub' }, '照片存入 IndexedDB，不会离开本机'),
          h('button', { class: 'btn primary', onclick: () => fileInput.click() }, icon('upload', 16), '上传照片')
        ),
        fileInput
      )
      return
    }
    const blob = await getBlob(current.reference_id)
    if (!blob) {
      refCard.append(h('p', { class: 'muted' }, '照片缓存丢失，请重新上传。'))
      return
    }
    const url = URL.createObjectURL(blob)
    const img = document.createElement('img')
    img.src = url
    img.style.width = '100%'
    img.style.borderRadius = 'var(--radius)'
    img.onload = () => {
      refMetrics = analyzeCanvas(img)
      URL.revokeObjectURL(url)
      renderMetrics(refCard, refMetrics, '参考照片量化')
      renderScore()
    }
    refCard.append(
      img,
      h(
        'div',
        { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn', onclick: () => fileInput.click() }, '更换照片'),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: async () => {
              if (current.reference_id) await deleteBlob(current.reference_id)
              workStore.mutate((w) => (w.reference_id = null))
              await workStore.saveNow()
              refMetrics = null
              renderRef()
              renderScore()
            }
          },
          '删除'
        )
      ),
      fileInput
    )
  }

  function captureSim() {
    resultCard.replaceChildren(h('div', { class: 'card-title' }, '推演结果量化'))
    // 等渲染循环把最新磨态画完再抓帧
    setTimeout(() => {
      try {
        simMetrics = analyzeCanvas(controller.canvas)
        renderMetrics(resultCard, simMetrics, '推演纹样量化')
        renderScore()
      } catch (err) {
        toast(err instanceof Error ? err.message : '抓帧失败')
      }
    }, 120)
    resultCard.append(
      h('p', { class: 'muted', style: 'line-height:1.6' }, '抓帧取自当前打磨回放位置，想比对最终态请先在打磨页回到最终磨态。'),
      h(
        'button',
        {
          class: 'btn primary',
          style: 'margin-top:12px',
          onclick: () => {
            controller.viewport.invalidate()
            captureSim()
          }
        },
        icon('eye', 16),
        '抓取当前推演画面'
      )
    )
  }

  function renderMetrics(card: HTMLElement, m: PatternMetrics, title: string) {
    const existing = card.querySelector('.metric-body')
    existing?.remove()
    const body = h('div', { class: 'metric-body', style: 'margin-top:16px' })
    body.append(
      h('div', { class: 'muted', style: 'margin-bottom:8px' }, title),
      h(
        'div',
        { class: 'stack' },
        ...m.color_ratio.map(
          (c) =>
            h(
              'div',
              { class: 'row', style: 'justify-content:space-between' },
              h('div', { class: 'row' }, h('span', { class: 'swatch', style: `background:${c.color}` }), h('span', { style: 'font-size:14px' }, c.color)),
              h('strong', { style: 'font-size:14px' }, `${(c.ratio * 100).toFixed(1)}%`)
            )
        )
      ),
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between;margin-top:12px' },
        h('span', { class: 'muted' }, '纹路密度'),
        h('strong', { style: 'font-size:14px' }, (m.line_density * 100).toFixed(1) + '%')
      ),
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between;margin-top:8px' },
        h('span', { class: 'muted' }, '圈纹密度'),
        h('strong', { style: 'font-size:14px' }, (m.ring_density * 100).toFixed(1) + '%')
      )
    )
    card.append(body)
  }

  function renderScore() {
    scoreCard.replaceChildren(h('div', { class: 'card-title' }, '比对结论'))
    if (!refMetrics || !simMetrics) {
      scoreCard.append(h('p', { class: 'muted' }, '上传参考照片并抓取推演画面后，自动生成比对结论。'))
      return
    }
    const colorGap = ratioDistance(refMetrics.color_ratio, simMetrics.color_ratio)
    const lineGap = Math.abs(refMetrics.line_density - simMetrics.line_density)
    const ringGap = Math.abs(refMetrics.ring_density - simMetrics.ring_density)
    const score = Math.max(0, 1 - colorGap * 0.5 - lineGap * 0.3 - ringGap * 0.2)
    scoreCard.append(
      h(
        'div',
        { style: 'text-align:center;padding:12px 0' },
        h('div', { style: 'font-size:28px;font-weight:600;color:var(--c-primary)' }, `${Math.round(score * 100)} 分`),
        h('div', { class: 'muted', style: 'margin-top:4px' }, '纹样接近度综合评分')
      ),
      gapRow('色块面积分布差异', colorGap),
      gapRow('纹路密度差异', lineGap),
      gapRow('圈纹密度差异', ringGap),
      h(
        'p',
        { class: 'muted', style: 'margin-top:12px;line-height:1.6' },
        score > 0.8
          ? '推演纹样与客户参考高度接近，可以安排实际髹涂。'
          : score > 0.6
            ? '主色调接近，但纹路密度有偏差，建议调整起底凸点高度或多磨 0.1~0.2mm。'
            : '差异较大，建议重做起底分布或调整髹层色序后再推演。'
      )
    )
  }

  function gapRow(label: string, gap: number) {
    return h(
      'div',
      { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' },
      h('span', { style: 'font-size:14px' }, label),
      h('span', { class: 'badge' }, (gap * 100).toFixed(1) + '%')
    )
  }

  await renderRef()
  captureSim()
}
