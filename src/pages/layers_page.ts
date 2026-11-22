// 髹漆层页：层序管理 + 名义参数 + GPU 实际厚度统计
import type { LacquerLayer } from '../core/types'
import { MAX_LAYERS, uid } from '../core/types'
import { h, clear, slider, toast } from '../ui/dom'
import { icon } from '../ui/icons'
import { workStore } from '../state/store'
import { createViewportHost } from '../ui/viewport_host'

export async function renderLayersPage(root: HTMLElement): Promise<void> {
  clear(root)
  const work = workStore.current
  if (!work) return
  const current = work

  const viewCol = h('div', {})
  const panel = h('div', { class: 'stack' })
  root.append(h('div', { class: 'grid-2' }, viewCol, panel))

  const controller = await createViewportHost(viewCol, current)
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const w = workStore.current
      if (!w) return
      controller.rebuildCoat(w)
      void workStore.saveNow()
      renderStats()
    }, 220)
  }

  const listCard = h('div', { class: 'card' })
  const statsCard = h('div', { class: 'card' })

  function renderList() {
    listCard.replaceChildren(
      h(
        'div',
        { class: 'card-title' },
        `髹漆层序（${current.layers.length}/${MAX_LAYERS}）`,
        h(
          'button',
          {
            class: 'btn sm primary',
            onclick: () => addLayer()
          },
          icon('plus', 15),
          '加一层'
        )
      )
    )
    if (current.layers.length === 0) {
      listCard.append(h('p', { class: 'muted' }, '还没有漆层，先加一层底灰漆吧。'))
      return
    }
    current.layers.forEach((layer, idx) => listCard.append(layerEditor(layer, idx)))
  }

  function layerEditor(layer: LacquerLayer, idx: number) {
    const box = h('div', {
      style: 'border:1px solid var(--c-border);border-radius:var(--radius);padding:var(--sp-4);margin-bottom:var(--sp-3)'
    })
    box.append(
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between;margin-bottom:var(--sp-3)' },
        h('div', { class: 'row' }, h('span', { class: 'swatch', style: `background:${layer.color}` }), h('strong', {}, `第 ${idx + 1} 层 · ${layer.name}`)),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn sm', onclick: () => moveLayer(idx, -1), disabled: idx === 0 },
            '上移'
          ),
          h(
            'button',
            {
              class: 'btn sm',
              onclick: () => moveLayer(idx, 1),
              disabled: idx === current.layers.length - 1
            },
            '下移'
          ),
          h('button', { class: 'btn sm danger', onclick: () => removeLayer(idx) }, icon('trash', 14))
        )
      ),
      h('input', {
        type: 'color',
        value: layer.color,
        oninput: (e: Event) => {
          const color = (e.target as HTMLInputElement).value
          workStore.mutate((w) => (w.layers[idx].color = color))
          schedule()
        }
      }),
      nameInput(layer, idx),
      slider('名义厚度', {
        min: 0.1,
        max: 1.2,
        step: 0.02,
        value: layer.thickness_mm,
        unit: 'mm',
        onInput: (v) => {
          workStore.mutate((w) => (w.layers[idx].thickness_mm = v))
          schedule()
        }
      }),
      slider('干燥收缩率', {
        min: 0,
        max: 0.3,
        step: 0.01,
        value: layer.shrink,
        onInput: (v) => {
          workStore.mutate((w) => (w.layers[idx].shrink = v))
          schedule()
        }
      }),
      slider('凸顶流薄系数', {
        min: 0,
        max: 1,
        step: 0.05,
        value: layer.flow,
        onInput: (v) => {
          workStore.mutate((w) => (w.layers[idx].flow = v))
          schedule()
        }
      }),
      slider('阴干天数', {
        min: 1,
        max: 30,
        step: 1,
        value: layer.dry_days,
        unit: '天',
        onInput: (v) => {
          workStore.mutate((w) => (w.layers[idx].dry_days = v))
          schedule()
        }
      })
    )
    return box
  }

  function nameInput(layer: LacquerLayer, idx: number) {
    const input = h('input', {
      type: 'text',
      value: layer.name,
      placeholder: '层名，如：朱红漆',
      oninput: (e: Event) => {
        workStore.mutate((w) => (w.layers[idx].name = (e.target as HTMLInputElement).value))
        schedule()
      }
    }) as HTMLInputElement
    input.style.marginTop = '12px'
    return input
  }

  function addLayer() {
    if (current.layers.length >= MAX_LAYERS) {
      toast(`最多支持 ${MAX_LAYERS} 层`)
      return
    }
    const palette = ['#1a1411', '#8e1c12', '#d9a441']
    workStore.mutate((w) =>
      w.layers.push({
        id: uid('ly'),
        name: `第 ${w.layers.length + 1} 层漆`,
        color: palette[w.layers.length % palette.length],
        thickness_mm: 0.4,
        dry_days: 7,
        shrink: 0.08,
        flow: 0.7
      })
    )
    renderList()
    schedule()
  }

  function removeLayer(idx: number) {
    workStore.mutate((w) => w.layers.splice(idx, 1))
    renderList()
    schedule()
  }

  function moveLayer(idx: number, dir: -1 | 1) {
    workStore.mutate((w) => {
      const target = idx + dir
      const [item] = w.layers.splice(idx, 1)
      w.layers.splice(target, 0, item)
    })
    renderList()
    schedule()
  }

  function renderStats() {
    const stats = controller.sim.stats
    statsCard.replaceChildren(
      h('div', { class: 'card-title' }, 'GPU 实算层厚（凸薄凹厚）'),
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, '层'), h('th', {}, '平均'), h('th', {}, '最薄'), h('th', {}, '最厚'))),
        h(
          'tbody',
          {},
          ...stats.map((s, i) =>
            h(
              'tr',
              {},
              h('td', {}, current.layers[i]?.name ?? `层 ${i + 1}`),
              h('td', {}, `${s.avg_mm.toFixed(3)} mm`),
              h('td', {}, `${s.min_mm.toFixed(3)} mm`),
              h('td', {}, `${s.max_mm.toFixed(3)} mm`)
            )
          )
        )
      ),
      h('p', { class: 'muted', style: 'margin-top:12px' }, '实际厚度 = 名义厚度 ×（1−收缩）× 曲率流挂系数，逐层在浮点纹理上求解。')
    )
  }

  renderList()
  renderStats()
  panel.append(listCard, statsCard)
}
