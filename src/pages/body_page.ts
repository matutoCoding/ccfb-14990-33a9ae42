// 胎体与起底页：器型参数 + 起底凸点 + OBJ 导入
import type { BodyParams, ReliefMode, ShapeType, Work } from '../core/types'
import { SIM_VERSIONS } from '../core/types'
import { h, clear, selectField, segmented, slider, toast } from '../ui/dom'
import { icon } from '../ui/icons'
import { workStore } from '../state/store'
import { createViewportHost } from '../ui/viewport_host'
import { importObjToCache } from '../webgl/sim_controller'

export async function renderBodyPage(root: HTMLElement): Promise<void> {
  clear(root)
  const work = workStore.current
  if (!work) return

  const viewCol = h('div', {})
  const panel = h('div', { class: 'stack' })
  root.append(h('div', { class: 'grid-2' }, viewCol, panel))

  const controller = await createViewportHost(viewCol, work)
  controller.viewport.opts.viewMode = 'relief'
  controller.viewport.invalidate()

  let rebuildTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleRebuild = () => {
    if (rebuildTimer) clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => {
      void controller.rebuildBody(workStore.current as Work).then(() => workStore.saveNow())
    }, 220)
  }

  // 器型卡片
  const shapeCard = h('div', { class: 'card' })
  shapeCard.append(
    h('div', { class: 'card-title' }, '胎体器型'),
    segmented<ShapeType>(
      [
        { value: 'plate', text: '茶盘' },
        { value: 'box', text: '捧盒' },
        { value: 'bowl', text: '漆碗' }
      ],
      work.body.shape,
      (v) => {
        workStore.mutate((w) => {
          w.body.shape = v
          w.body.obj_id = null
        })
        scheduleRebuild()
      }
    ),
    slider('胎体直径', {
      min: 120,
      max: 600,
      step: 5,
      value: work.body.diameter_mm,
      unit: 'mm',
      onInput: (v) => {
        workStore.mutate((w) => (w.body.diameter_mm = v))
        scheduleRebuild()
      }
    }),
    slider('器高', {
      min: 8,
      max: 140,
      step: 1,
      value: work.body.height_mm,
      unit: 'mm',
      onInput: (v) => {
        workStore.mutate((w) => (w.body.height_mm = v))
        scheduleRebuild()
      }
    }),
    slider('壁厚', {
      min: 3,
      max: 20,
      step: 0.5,
      value: work.body.wall_mm,
      unit: 'mm',
      onInput: (v) => {
        workStore.mutate((w) => (w.body.wall_mm = v))
        scheduleRebuild()
      }
    })
  )

  // OBJ 导入
  const objInput = document.createElement('input')
  objInput.type = 'file'
  objInput.accept = '.obj'
  objInput.hidden = true
  objInput.addEventListener('change', async () => {
    const file = objInput.files?.[0]
    if (!file || !workStore.current) return
    try {
      const { id } = await importObjToCache(file, workStore.current)
      workStore.mutate((w) => {
        w.body.obj_id = id
      })
      await controller.rebuildBody(workStore.current)
      toast('OBJ 已栅格化为胎体高度场')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'OBJ 导入失败')
    } finally {
      objInput.value = ''
    }
  })
  const objCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '外部胎体 OBJ'),
    h('p', { class: 'muted', style: 'margin-bottom:12px;line-height:1.6' }, '按俯视正交投影取顶高，适合规整器型；导入后以 OBJ 外形为准，壁厚用于侧壁封底。'),
    h(
      'button',
      {
        class: 'btn',
        onclick: () => objInput.click()
      },
      icon('upload', 16),
      work.body.obj_id ? '重新导入 OBJ' : '导入 OBJ 文件'
    ),
    objInput
  )

  // 起底卡片
  const reliefCard = h('div', { class: 'card' })
  reliefCard.append(
    h('div', { class: 'card-title' }, '起底凸点'),
    selectField(
      '布点方式',
      [
        { value: 'jittered', text: '抖动网格（稠漆点）' },
        { value: 'finger', text: '手指捺痕' },
        { value: 'hemp', text: '麻籽撒点' },
        { value: 'ridge', text: '平行棱脊' }
      ],
      work.relief.mode,
      (v) => {
        workStore.mutate((w) => (w.relief.mode = v as ReliefMode))
        scheduleRebuild()
      }
    ),
    slider('凸点密度', {
      min: 1,
      max: 16,
      step: 0.5,
      value: work.relief.density_per_cm2,
      unit: '点/cm²',
      onInput: (v) => {
        workStore.mutate((w) => (w.relief.density_per_cm2 = v))
        scheduleRebuild()
      }
    }),
    slider('凸点高度', {
      min: 0.2,
      max: 2.5,
      step: 0.05,
      value: work.relief.height_mm,
      unit: 'mm',
      onInput: (v) => {
        workStore.mutate((w) => (w.relief.height_mm = v))
        scheduleRebuild()
      }
    }),
    slider('凸点半径', {
      min: 2,
      max: 16,
      step: 0.5,
      value: work.relief.radius_mm,
      unit: 'mm',
      onInput: (v) => {
        workStore.mutate((w) => (w.relief.radius_mm = v))
        scheduleRebuild()
      }
    }),
    slider('随机抖动', {
      min: 0,
      max: 1,
      step: 0.05,
      value: work.relief.jitter,
      onInput: (v) => {
        workStore.mutate((w) => (w.relief.jitter = v))
        scheduleRebuild()
      }
    }),
    slider('捺痕拉伸', {
      min: 1,
      max: 4,
      step: 0.1,
      value: work.relief.stretch,
      onInput: (v) => {
        workStore.mutate((w) => (w.relief.stretch = v))
        scheduleRebuild()
      }
    }),
    h(
      'button',
      {
        class: 'btn sm',
        onclick: () => {
          workStore.mutate((w) => (w.relief.seed = Math.floor(Math.random() * 100000)))
          scheduleRebuild()
        }
      },
      icon('reset', 15),
      '换一组随机种子'
    )
  )

  // 推演精度
  const simCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '推演精度'),
    selectField(
      '网格分辨率（重建全部漆层）',
      SIM_VERSIONS.map((r) => ({ value: String(r), text: `${r} × ${r}` })),
      String(work.sim_resolution),
      (v) => {
        const res = Number(v)
        toast('分辨率变更将重建推演，请稍候')
        workStore.mutate((w) => (w.sim_resolution = res))
        setTimeout(() => location.reload(), 500)
      }
    )
  )

  panel.append(shapeCard, objCard, reliefCard, simCard)
}

export function bodySummary(body: BodyParams): string {
  return `Φ${body.diameter_mm}mm · 高${body.height_mm}mm · 壁厚${body.wall_mm}mm`
}
