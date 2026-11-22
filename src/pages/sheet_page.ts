// 工艺单页：完整髹饰工艺参数，浏览器原生打印
import type { Work } from '../core/types'
import { h, clear, formatDate } from '../ui/dom'
import { icon } from '../ui/icons'
import { workStore } from '../state/store'
import { SHAPE_LABELS } from '../core/shapes'
import { describeOperation } from '../webgl/sim_controller'
import { bodySummary } from './body_page'

const RELIEF_LABELS: Record<Work['relief']['mode'], string> = {
  jittered: '抖动网格稠漆点',
  finger: '手指捺痕',
  hemp: '麻籽撒点',
  ridge: '平行棱脊'
}

export function renderSheetPage(root: HTMLElement): void {
  clear(root)
  const work = workStore.current
  if (!work) return

  const toolbar = h(
    'div',
    { class: 'row no-print', style: 'justify-content:flex-end;margin-bottom:16px' },
    h(
      'button',
      { class: 'btn primary', onclick: () => window.print() },
      icon('print', 16),
      '打印 / 另存 PDF'
    )
  )

  const head = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '犀皮漆髹饰工艺单'),
    infoGrid([
      ['订单号', work.order_no],
      ['作品名', work.name],
      ['器型', SHAPE_LABELS[work.body.shape]],
      ['胎体规格', bodySummary(work.body)],
      ['建档时间', formatDate(work.created_at)],
      ['推演网格', `${work.sim_resolution} × ${work.sim_resolution}`]
    ]),
    work.note ? h('p', { style: 'margin-top:12px;line-height:1.7' }, work.note) : null
  )

  const reliefCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '一、起底工艺'),
    infoGrid([
      ['起底方式', RELIEF_LABELS[work.relief.mode]],
      ['凸点密度', `${work.relief.density_per_cm2} 点/cm²`],
      ['凸点高度', `${work.relief.height_mm} mm`],
      ['凸点半径', `${work.relief.radius_mm} mm`],
      ['抖动系数', work.relief.jitter.toFixed(2)],
      ['捺痕拉伸', work.relief.stretch.toFixed(1)],
      ['随机种子', String(work.relief.seed)],
      ['总阴干周期', `${work.layers.reduce((s, l) => s + l.dry_days, 0)} 天`]
    ])
  )

  const layerCard = h('div', { class: 'card' })
  layerCard.append(
    h('div', { class: 'card-title' }, '二、髹漆层序与实算厚度'),
    h(
      'table',
      { class: 'table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', {}, '序'),
          h('th', {}, '色卡'),
          h('th', {}, '层名'),
          h('th', {}, '名义厚度'),
          h('th', {}, '收缩率'),
          h('th', {}, '流薄系数'),
          h('th', {}, '阴干')
        )
      ),
      h(
        'tbody',
        {},
        ...work.layers.map((layer, i) =>
          h(
            'tr',
            {},
            h('td', {}, String(i + 1)),
            h('td', {}, h('span', { class: 'swatch', style: `background:${layer.color}` })),
            h('td', {}, layer.name),
            h('td', {}, `${layer.thickness_mm.toFixed(2)} mm`),
            h('td', {}, `${Math.round(layer.shrink * 100)}%`),
            h('td', {}, layer.flow.toFixed(2)),
            h('td', {}, `${layer.dry_days} 天`)
          )
        )
      )
    ),
    h(
      'p',
      { class: 'muted', style: 'margin-top:12px;line-height:1.6' },
      '实算厚度受凸点曲率流挂影响，逐点不同；详细均值/极值见髹漆层页的 GPU 统计表。'
    )
  )

  const grindCard = h('div', { class: 'card' })
  grindCard.append(
    h('div', { class: 'card-title' }, '三、打磨顺序'),
    work.operations.length === 0
      ? h('p', { class: 'muted' }, '暂无打磨记录。')
      : h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, '序'), h('th', {}, '操作'), h('th', {}, '磨具'), h('th', {}, '触点数'), h('th', {}, '时间'))),
          h(
            'tbody',
            {},
            ...work.operations.map((op, i) =>
              h(
                'tr',
                {},
                h('td', {}, String(i + 1)),
                h('td', {}, op.label),
                h('td', {}, op.tool.name),
                h('td', {}, op.tool.type === 'planar' ? '—' : String(op.samples.length)),
                h('td', {}, formatDate(op.created_at))
              )
            )
          )
        ),
    h(
      'p',
      { class: 'muted', style: 'margin-top:12px;line-height:1.6' },
      `工艺要点：${describeOperation(work.operations[work.operations.length - 1] ?? { tool: { name: '待下刀' } } as never)} 为最后一道磨显；磨穿区域在推演中标红，实作时应避开对应位置重压。`
    )
  )

  const signCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '四、验收与签字'),
    infoGrid([
      ['髹涂师傅', ''],
      ['磨显师傅', ''],
      ['验收意见', ''],
      ['交付日期', '']
    ])
  )

  root.append(toolbar, head, reliefCard, layerCard, grindCard, signCard)
}

function infoGrid(pairs: [string, string][]): HTMLElement {
  return h(
    'div',
    {
      style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px 24px'
    },
    ...pairs.map(
      ([k, v]) =>
        h(
          'div',
          {},
          h('div', { class: 'muted', style: 'margin-bottom:4px' }, k),
          h('div', { style: 'font-weight:500' }, v || '—')
        )
    )
  )
}
