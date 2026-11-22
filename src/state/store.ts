// 极简发布订阅 store，管理当前作品与路由
import type { Work } from '../core/types'
import { getWork, listWorks, saveWork, deleteWork, countWorks } from '../db/idb'
import { seedWorks } from '../db/seed_works'

type Listener = () => void

class WorkStore {
  current: Work | null = null
  summaries: Awaited<ReturnType<typeof listWorks>> = []
  private listeners = new Set<Listener>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  async init() {
    if ((await countWorks()) === 0) {
      for (const work of seedWorks()) {
        await saveWork(work)
      }
    }
    await this.refreshList()
  }

  async refreshList() {
    this.summaries = await listWorks()
    this.emit()
  }

  async open(id: string): Promise<Work> {
    const work = await getWork(id)
    if (!work) throw new Error('作品不存在或已被删除')
    this.current = structuredClone(work)
    this.emit()
    return this.current
  }

  close() {
    this.current = null
    this.emit()
  }

  // 即时更新内存态；持久化走防抖，避免滑杆拖动打爆 IndexedDB
  mutate(mutator: (work: Work) => void) {
    if (!this.current) return
    mutator(this.current)
    this.current.updated_at = Date.now()
    this.emit()
    this.queueSave()
  }

  async saveNow() {
    if (!this.current) return
    await saveWork(this.current)
    await this.refreshList()
  }

  private queueSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      if (this.current) void saveWork(this.current)
    }, 400)
  }

  async remove(id: string) {
    await deleteWork(id)
    if (this.current?.id === id) this.close()
    await this.refreshList()
  }
}

export const workStore = new WorkStore()
