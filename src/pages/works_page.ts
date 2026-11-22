// 作品列表页：按订单管理
import { h, clear, formatDate } from '../ui/dom'
import { icon } from '../ui/icons'
import { navigate } from '../state/router'
import { workStore } from '../state/store'
import { disposeController } from '../state/sim_context'
import { createWork } from '../core/work_factory'
import { SHAPE_LABELS } from '../core/shapes'
import { saveWork } from '../db/idb'

export function renderWorksPage(root: HTMLElement): void {
  clear(root)
  const summaries = workStore.summaries

  const createCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '新建订单作品'),
    h('div', { class: 'row' }, nameInput(), orderInput(), createBtn())
  )

  const list = h('div', { class: 'card' })
  if (summaries.length === 0) {
    list.append(emptyState())
  } else {
    list.append(
      h(
        'table',
        { class: 'table' },
        h(
          'thead',
          {},
          h('tr', {}, h('th', {}, '订单号'), h('th', {}, '作品名'), h('th', {}, '器型'), h('th', {}, '漆层'), h('th', {}, '磨次'), h('th', {}, '更新时间'), h('th', {}))
        ),
        h(
          'tbody',
          {},
          ...summaries.map((s) =>
            h(
              'tr',
              {},
              h('td', {}, s.order_no),
              h('td', {}, s.name),
              h('td', {}, SHAPE_LABELS[s.shape]),
              h('td', {}, String(s.layer_count)),
              h('td', {}, String(s.op_count)),
              h('td', {}, formatDate(s.updated_at)),
              h(
                'td',
                {},
                h(
                  'div',
                  { class: 'row' },
                  h(
                    'button',
                    {
                      class: 'btn sm primary',
                      onclick: () => openWork(s.id)
                    },
                    icon('eye', 15),
                    '打开'
                  ),
                  h(
                    'button',
                    {
                      class: 'btn sm danger',
                      onclick: () => void workStore.remove(s.id)
                    },
                    icon('trash', 15),
                    '删除'
                  )
                )
              )
            )
          )
        )
      )
    )
  }

  root.append(createCard, list)

  function nameInput() {
    const input = h('input', { type: 'text', placeholder: '作品名称，如：松纹茶盘' }) as HTMLInputElement
    input.style.flex = '1'
    return input
  }
  function orderInput() {
    const input = h('input', {
      type: 'text',
      placeholder: '订单号，如：XP-2026-005',
      value: nextOrderNo()
    }) as HTMLInputElement
    input.style.flex = '1'
    return input
  }
  function createBtn() {
    return h(
      'button',
      {
        class: 'btn primary',
        onclick: async () => {
          const name = (createCard.querySelector('input:first-of-type') as HTMLInputElement).value.trim()
          const orderNo = (createCard.querySelectorAll('input')[1] as HTMLInputElement).value.trim()
          if (!name || !orderNo) return
          const work = createWork(name, orderNo)
          await saveWork(work)
          await workStore.refreshList()
          await workStore.open(work.id)
          disposeController()
          navigate('body')
        }
      },
      icon('plus', 16),
      '新建作品'
    )
  }
}

function nextOrderNo(): string {
  const year = new Date().getFullYear()
  const seq = String(workStore.summaries.length + 1).padStart(3, '0')
  return `XP-${year}-${seq}`
}

async function openWork(id: string) {
  disposeController()
  await workStore.open(id)
  navigate('body')
}

function emptyState(): HTMLElement {
  return h(
    'div',
    { class: 'empty-state' },
    icon('works', 40),
    h('div', { class: 'empty-title' }, '还没有作品档案'),
    h('div', { class: 'empty-sub' }, '新建一个订单，或检查 IndexedDB 是否被浏览器清理'),
    h('button', { class: 'btn primary', onclick: () => navigate('works') }, '刷新列表')
  )
}
