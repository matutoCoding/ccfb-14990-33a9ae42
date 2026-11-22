// 轻量 DOM 构造器与通用表单组件，无框架依赖

export type ElChild = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener> = {},
  ...children: ElChild[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === 'class') {
      el.className = String(value)
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '')
    } else {
      el.setAttribute(key, String(value))
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return el
}

export function clear(el: HTMLElement): void {
  el.replaceChildren()
}

export function mount(el: HTMLElement, child: Node): void {
  el.replaceChildren(child)
}

export interface SliderOpts {
  min: number
  max: number
  step: number
  value: number
  unit?: string
  onInput: (v: number) => void
}

export function slider(label: string, opts: SliderOpts): HTMLElement {
  const value = h('span', { class: 'field-value' }, formatValue(opts.value, opts.unit))
  const input = h('input', {
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step,
    value: opts.value,
    oninput: () => {
      const v = Number(input.value)
      value.textContent = formatValue(v, opts.unit)
      opts.onInput(v)
    }
  }) as HTMLInputElement
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-label' }, h('span', {}, label), value),
    input
  )
}

function formatValue(v: number, unit?: string): string {
  const text = Number.isInteger(v) ? String(v) : v.toFixed(2)
  return unit ? `${text} ${unit}` : text
}

export function textField(label: string, value: string, onInput: (v: string) => void): HTMLElement {
  const input = h('input', {
    type: 'text',
    value,
    oninput: () => onInput(input.value)
  }) as HTMLInputElement
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), input)
}

export function selectField(
  label: string,
  options: { value: string; text: string }[],
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const select = h(
    'select',
    { onchange: () => onChange(select.value) },
    ...options.map((o) =>
      h('option', { value: o.value, ...(o.value === value ? { selected: true } : {}) }, o.text)
    )
  ) as HTMLSelectElement
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), select)
}

export function segmented<T extends string>(
  options: { value: T; text: string }[],
  value: T,
  onChange: (v: T) => void
): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    ...options.map((o) =>
      h(
        'button',
        {
          class: o.value === value ? 'active' : '',
          onclick: () => onChange(o.value)
        },
        o.text
      )
    )
  )
}

export function toast(message: string): void {
  const el = h('div', { class: 'toast' }, message)
  document.body.append(el)
  setTimeout(() => el.remove(), 2600)
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
