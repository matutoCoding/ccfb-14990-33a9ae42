// hash 路由：#/works、#/body 等六个页面
export type Route = 'works' | 'body' | 'layers' | 'grind' | 'compare' | 'sheet'

const ROUTES: Route[] = ['works', 'body', 'layers', 'grind', 'compare', 'sheet']

export function currentRoute(): Route {
  const hash = location.hash.replace('#/', '').split('?')[0]
  return (ROUTES as string[]).includes(hash) ? (hash as Route) : 'works'
}

export function navigate(route: Route) {
  location.hash = `#/${route}`
}

export function onRouteChange(fn: (route: Route) => void): () => void {
  const handler = () => fn(currentRoute())
  window.addEventListener('hashchange', handler)
  return () => window.removeEventListener('hashchange', handler)
}
