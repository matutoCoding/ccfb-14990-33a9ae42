// 统一 1.7 线宽线性图标，stroke=currentColor 跟随文字色
const STROKE = 1.7

const PATHS = {
  works: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
  body: '<ellipse cx="12" cy="12" rx="8" ry="5"/><ellipse cx="12" cy="12" rx="3" ry="5"/><path d="M4 12c0 2.8 3.6 5 8 5s8-2.2 8-5"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  grind: '<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.6"/><path d="m12 12 8 8"/><path d="m17 17 2-2 3 3-2 2-3-3Z"/>',
  compare: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>',
  sheet: '<path d="M6 2h9l4 4v16H6V2Z"/><path d="M14 2v5h5"/><path d="M9 12h7M9 16h7M9 8h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/>',
  cube: '<path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  reset: '<path d="M4 10a8 8 0 1 1-1 5"/><path d="M4 4v6h6"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 14h10v7H7v-7Z"/><path d="M17 11h.01"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  play: '<path d="M7 4.5v15l13-7.5-13-7.5Z"/>',
  back: '<path d="m11 18-6-6 6-6M19 18l-6-6 6-6"/>'
} as const

export type IconName = keyof typeof PATHS

export function icon(name: IconName, size = 20): HTMLElement {
  const wrap = document.createElement('span')
  wrap.style.display = 'inline-flex'
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`
  const el = wrap.firstElementChild
  if (!el) throw new Error('图标解析失败')
  return el as unknown as HTMLElement
}
