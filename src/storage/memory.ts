import type { Settings } from '../domain/types'
import { STORE_NAMES, type Outbox, type OutboxOp, type Snapshot, type Storage, type StoreName } from './types'

/** Implementação em memória: usada nos testes e como referência do contrato. */
export function createMemoryStorage(): Storage {
  const stores = Object.fromEntries(STORE_NAMES.map((s) => [s, new Map<string, { id: string }>()])) as Record<StoreName, Map<string, { id: string }>>
  let settings: Settings | null = null
  const clone = <T,>(v: T): T => structuredClone(v)

  return {
    async getAll(store) {
      return clone([...stores[store].values()]) as never
    },
    async get(store, id) {
      const v = stores[store].get(id)
      return (v && clone(v)) as never
    },
    async put(store, item) {
      stores[store].set(item.id, clone(item))
    },
    async putMany(store, items) {
      for (const i of items) stores[store].set(i.id, clone(i))
    },
    async remove(store, id) {
      stores[store].delete(id)
    },
    async getSettings() {
      return settings && clone(settings)
    },
    async saveSettings(s) {
      settings = clone(s)
    },
    async snapshot(): Promise<Snapshot> {
      const data = {} as Snapshot['data']
      for (const s of STORE_NAMES) (data as Record<string, unknown>)[s] = clone([...stores[s].values()])
      return { data, settings: settings && clone(settings) }
    },
    async restore(snap) {
      for (const s of STORE_NAMES) {
        stores[s].clear()
        for (const item of snap.data[s]) stores[s].set(item.id, clone(item))
      }
      settings = snap.settings && clone(snap.settings)
    },
  }
}

/** Fila de envio em memória (testes). */
export function createMemoryOutbox(): Outbox {
  const ops = new Map<string, OutboxOp>()
  let tick = 0
  return {
    async add(op) {
      const key = `${op.store}:${op.id}`
      ops.set(key, { ...op, key, at: ++tick })
    },
    async list() {
      return [...ops.values()].map((o) => ({ ...o }))
    },
    async remove(list) {
      for (const o of list) if (ops.get(o.key)?.at === o.at) ops.delete(o.key)
    },
    async clear() {
      ops.clear()
    },
  }
}
