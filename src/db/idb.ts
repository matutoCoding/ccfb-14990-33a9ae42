// IndexedDB 封装：works / blobs / obj_cache 三个对象仓库，全部 Promise 化
import type { Work, WorkSummary } from '../core/types'

const DB_NAME = 'xipi-studio'
const DB_VERSION = 1
const STORE_WORKS = 'works'
const STORE_BLOBS = 'blobs'
const STORE_OBJ = 'obj_cache'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_WORKS)) {
        db.createObjectStore(STORE_WORKS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_OBJ)) {
        db.createObjectStore(STORE_OBJ, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export async function saveWork(work: Work): Promise<void> {
  await tx(STORE_WORKS, 'readwrite', (s) => s.put(work))
}

export async function getWork(id: string): Promise<Work | undefined> {
  return tx(STORE_WORKS, 'readonly', (s) => s.get(id) as IDBRequest<Work>)
}

export async function deleteWork(id: string): Promise<void> {
  await tx(STORE_WORKS, 'readwrite', (s) => s.delete(id))
}

export async function listWorks(): Promise<WorkSummary[]> {
  const works = await tx<Work[]>(STORE_WORKS, 'readonly', (s) => s.getAll() as IDBRequest<Work[]>)
  return works
    .map((w) => ({
      id: w.id,
      name: w.name,
      order_no: w.order_no,
      shape: w.body.shape,
      layer_count: w.layers.length,
      op_count: w.operations.length,
      updated_at: w.updated_at
    }))
    .sort((a, b) => b.updated_at - a.updated_at)
}

export async function countWorks(): Promise<number> {
  return tx(STORE_WORKS, 'readonly', (s) => s.count())
}

export interface BlobRecord {
  id: string
  blob: Blob
  created_at: number
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const record: BlobRecord = { id, blob, created_at: Date.now() }
  await tx(STORE_BLOBS, 'readwrite', (s) => s.put(record))
}

export async function getBlob(id: string): Promise<Blob | null> {
  const rec = await tx<BlobRecord>(STORE_BLOBS, 'readonly', (s) =>
    s.get(id) as IDBRequest<BlobRecord>
  )
  return rec ? rec.blob : null
}

export async function deleteBlob(id: string): Promise<void> {
  await tx(STORE_BLOBS, 'readwrite', (s) => s.delete(id))
}

export interface ObjCacheRecord {
  id: string
  source_name: string
  rgba: Float32Array
  domain_mm: number
  resolution: number
}

export async function saveObjCache(record: ObjCacheRecord): Promise<void> {
  await tx(STORE_OBJ, 'readwrite', (s) => s.put(record))
}

export async function getObjCache(id: string): Promise<ObjCacheRecord | undefined> {
  return tx(STORE_OBJ, 'readonly', (s) => s.get(id) as IDBRequest<ObjCacheRecord>)
}
