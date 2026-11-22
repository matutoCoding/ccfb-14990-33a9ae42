import './styles/tokens.css'
import './styles/app.css'
import { h, mount } from './ui/dom'
import { icon, type IconName } from './ui/icons'
import { currentRoute, navigate, onRouteChange, type Route } from './state/router'
import { workStore } from './state/store'
import { disposeController } from './state/sim_context'
import { renderWorksPage } from './pages/works_page'
import { renderBodyPage } from './pages/body_page'
import { renderLayersPage } from './pages/layers_page'
import { renderGrindPage } from './pages/grind_page'
import { renderComparePage } from './pages/compare_page'
import { renderSheetPage } from './pages/sheet_page'

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: 'works', label: '作品列表', icon: 'works' },
  { route: 'body', label: '胎体与起底', icon: 'body' },
  { route: 'layers', label: '髹漆层', icon: 'layers' },
  { route: 'grind', label: '打磨推演', icon: 'grind' },
  { route: 'compare', label: '纹样比对', icon: 'compare' },
  { route: 'sheet', label: '工艺单', icon: 'sheet' }
]

const TITLES: Record<Route, string> = {
  works: '作品订单',
  body: '胎体与起底',
  layers: '髹漆层管理',
  grind: '打磨推演',
  compare: '纹样比对',
  sheet: '工艺单'
}

async function boot() {
  await workStore.init()
  const app = document.getElementById('app')
  if (!app) throw new Error('#app 挂载点缺失')

  const content = h('div', { class: 'content' })
  const titleEl = h('div', { class: 'page-title' }, TITLES.works)
  const workTag = h('span', { class: 'badge' }, '未选择作品')

  const nav = h(
    'nav',
    { class: 'stack' },
    ...NAV.map((item) =>
      h(
        'button',
        {
          class: 'nav-item',
          'data-route': item.route,
          onclick: () => navigate(item.route)
        },
        icon(item.icon, 18),
        h('span', {}, item.label)
      )
    )
  )

  const shell = h(
    'div',
    { class: 'app-shell' },
    h(
      'aside',
      { class: 'sidebar' },
      h(
        'div',
        { class: 'brand' },
        h('div', { class: 'brand-mark' }, icon('layers', 20)),
        h('div', {}, h('div', { class: 'brand-title' }, '犀皮推演台'), h('div', { class: 'brand-sub' }, '髹饰工艺数字工坊'))
      ),
      nav
    ),
    h(
      'main',
      { class: 'main' },
      h('div', { class: 'topbar' }, titleEl, workTag),
      content
    )
  )
  mount(app, shell)

  const renderRoute = (route: Route) => {
    if (route !== 'works' && !workStore.current) {
      navigate('works')
      return
    }
    if (route === 'works') disposeController()
    titleEl.textContent = TITLES[route]
    nav.querySelectorAll<HTMLElement>('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === route)
    })
    const work = workStore.current
    workTag.textContent = work ? `${work.order_no} · ${work.name}` : '未选择作品'
    const renderers: Record<Route, () => Promise<void> | void> = {
      works: () => renderWorksPage(content),
      body: () => renderBodyPage(content),
      layers: () => renderLayersPage(content),
      grind: () => renderGrindPage(content),
      compare: () => renderComparePage(content),
      sheet: () => renderSheetPage(content)
    }
    void renderers[route]()
  }

  onRouteChange(renderRoute)
  workStore.subscribe(() => {
    workTag.textContent = workStore.current
      ? `${workStore.current.order_no} · ${workStore.current.name}`
      : '未选择作品'
  })
  renderRoute(currentRoute())
}

void boot()
