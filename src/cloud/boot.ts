import type { SupabaseClient } from '@supabase/supabase-js'
import { createIndexedDBStorage } from '../storage/indexeddb'
import type { Storage } from '../storage/types'
import { createSupabaseRemote, subscribeToHousehold } from './supabaseRemote'
import { createSync, createSyncedStorage, type SyncStatus } from './sync'

export interface Household {
  id: string
  name: string
  invite_code: string
  members: number
}

const OWNER = 'money.sync.owner'
const cursorKey = (h: string) => `money.sync.cursor.${h}`
const replaceKey = (h: string) => `money.sync.replace.${h}`

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* armazenamento indisponível */
  }
}

/** Apaga os dados deste aparelho (IndexedDB e marcas de sincronização). A nuvem não é tocada. */
export async function wipeLocal(): Promise<void> {
  for (const k of Object.keys(localStorage)) if (k.startsWith('money.sync.')) write(k, null)
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('money')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

export interface CloudRuntime {
  storage: Storage
  syncNow(): Promise<void>
  getStatus(): SyncStatus
  dispose(): void
}

/**
 * Liga o aparelho ao espaço do casal: abre o banco local, embrulha com a fila de envio, faz a primeira sincronização
 * e fica ouvindo (tempo real, volta da internet, app em primeiro plano e um relógio de segurança de 1 minuto).
 */
export async function bootCloud(client: SupabaseClient, household: Household, onApplied: () => void, onStatus: (s: SyncStatus) => void): Promise<CloudRuntime> {
  // dados de outra conta neste aparelho nunca podem subir para este espaço
  const owner = read(OWNER)
  if (owner && owner !== household.id) await wipeLocal()
  write(OWNER, household.id)

  const local = await createIndexedDBStorage()
  const remote = createSupabaseRemote(client, household.id)
  const h = household.id
  let timer: ReturnType<typeof setTimeout> | undefined

  const sync = createSync({
    local,
    outbox: local.outbox,
    remote,
    cursor: { get: () => read(cursorKey(h)), set: (v) => write(cursorKey(h), v) },
    replacePending: { get: () => read(replaceKey(h)) === '1', set: (v) => write(replaceKey(h), v ? '1' : null) },
    onApplied,
    onStatus,
  })
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void sync.syncNow(), 1500)
  }
  const storage = createSyncedStorage(local, local.outbox, { onDirty: schedule, onReplace: () => write(replaceKey(h), '1') })

  await sync.syncNow() // a tela só abre depois da primeira sincronização (ou do aviso de falha)

  const onVisible = () => {
    if (!document.hidden) void sync.syncNow()
  }
  const onOnline = () => void sync.syncNow()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  const interval = setInterval(() => void sync.syncNow(), 60_000)
  const unsubscribe = subscribeToHousehold(client, h, () => void sync.syncNow())

  return {
    storage,
    syncNow: sync.syncNow,
    getStatus: sync.getStatus,
    dispose() {
      clearTimeout(timer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      unsubscribe()
    },
  }
}
