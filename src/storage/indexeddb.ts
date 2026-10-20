import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Settings } from '../domain/types'
import { STORE_NAMES, type Entities, type Snapshot, type Storage, type StoreName } from './types'

interface MoneyDB extends DBSchema {
  categories: { key: string; value: Entities['categories'] }
  bills: { key: string; value: Entities['bills']; indexes: { vencimento: string } }
  transactions: { key: string; value: Entities['transactions']; indexes: { data: string } }
  goals: { key: string; value: Entities['goals'] }
  rules: { key: string; value: Entities['rules'] }
  settings: { key: string; value: Settings & { key: string } }
}

const SETTINGS_KEY = 'app'

export async function createIndexedDBStorage(name = 'money'): Promise<Storage> {
  const db: IDBPDatabase<MoneyDB> = await openDB<MoneyDB>(name, 1, {
    upgrade(d) {
      for (const s of STORE_NAMES) {
        const store = d.createObjectStore(s, { keyPath: 'id' }) as unknown as IDBObjectStore
        if (s === 'bills') store.createIndex('vencimento', 'vencimento')
        if (s === 'transactions') store.createIndex('data', 'data')
      }
      d.createObjectStore('settings', { keyPath: 'key' })
    },
  })

  const getSettings = async () => {
    const row = await db.get('settings', SETTINGS_KEY)
    if (!row) return null
    const { key: _key, ...settings } = row
    return settings
  }

  return {
    getAll: (store) => db.getAll(store as StoreName) as never,
    async put(store, item) {
      await db.put(store as StoreName, item as never)
    },
    async putMany(store, items) {
      const tx = db.transaction(store as StoreName, 'readwrite')
      await Promise.all([...items.map((i) => tx.store.put(i as never)), tx.done])
    },
    async remove(store, id) {
      await db.delete(store as StoreName, id)
    },
    getSettings,
    async saveSettings(settings) {
      await db.put('settings', { ...settings, key: SETTINGS_KEY })
    },
    async snapshot(): Promise<Snapshot> {
      const data = {} as Snapshot['data']
      for (const s of STORE_NAMES) (data as Record<string, unknown>)[s] = await db.getAll(s)
      return { data, settings: await getSettings() }
    },
    async restore(snap) {
      const tx = db.transaction([...STORE_NAMES, 'settings'], 'readwrite')
      const ops: Promise<unknown>[] = [tx.objectStore('settings').clear()]
      for (const s of STORE_NAMES) {
        const os = tx.objectStore(s)
        ops.push(os.clear())
        for (const item of snap.data[s]) ops.push(os.put(item as never))
      }
      if (snap.settings) ops.push(tx.objectStore('settings').put({ ...snap.settings, key: SETTINGS_KEY }))
      await Promise.all([...ops, tx.done])
    },
  }
}
