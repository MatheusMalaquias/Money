import { STORE_NAMES, type Entities, type Outbox, type OutboxOp, type Snapshot, type Storage, type StoreName } from '../storage/types'
import type { Settings } from '../domain/types'

/** Uma linha na nuvem. Apagar vira "lápide" (deleted) para o outro aparelho também apagar. */
export interface RemoteRow {
  store: string
  id: string
  data: unknown
  deleted: boolean
  /** Carimbo do servidor: define a ordem em que os aparelhos recebem as mudanças. */
  updated_at: string
}

/** O que o motor precisa da nuvem. O Supabase implementa; os testes usam uma versão em memória. */
export interface Remote {
  /** Linhas alteradas depois de `after` (null = todas), da mais antiga à mais nova. */
  pull(after: string | null, limit: number): Promise<RemoteRow[]>
  push(rows: Omit<RemoteRow, 'updated_at'>[]): Promise<void>
  /** Apaga tudo do espaço (usado ao importar um backup ou zerar). */
  wipe(): Promise<void>
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'
export interface SyncStatus {
  state: SyncState
  /** Alterações locais ainda não enviadas. */
  pending: number
  lastSync: number | null
  error?: string
}

interface Persist<T> {
  get(): T
  set(v: T): void
}

export interface SyncDeps {
  local: Storage
  outbox: Outbox
  remote: Remote
  /** Até onde este aparelho já recebeu (updated_at da última linha). */
  cursor: Persist<string | null>
  /** Importação/zerar feitos sem conexão: na próxima vez a nuvem é substituída. */
  replacePending: Persist<boolean>
  /** Chamado quando linhas vindas da nuvem mudaram os dados locais (a tela precisa reler). */
  onApplied: () => void
  onStatus?: (s: SyncStatus) => void
}

const PAGE = 500
const CHUNK = 200
/** Relê um pouco antes do cursor: se dois aparelhos gravam quase juntos, uma linha pode "chegar atrasada". Reaplicar é inofensivo. */
const OVERLAP_MS = 10_000

const isNetworkError = (e: unknown) => e instanceof TypeError || /fetch|network|failed to|offline/i.test(String((e as Error)?.message ?? e))

export function createSync(deps: SyncDeps) {
  const { local, outbox, remote, cursor, replacePending, onApplied, onStatus } = deps
  let status: SyncStatus = { state: 'idle', pending: 0, lastSync: null }
  let running: Promise<void> | null = null
  let again = false

  const setStatus = async (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch, pending: (await outbox.list()).length }
    onStatus?.(status)
  }

  async function everything(): Promise<Omit<RemoteRow, 'updated_at'>[]> {
    const rows: Omit<RemoteRow, 'updated_at'>[] = []
    for (const store of STORE_NAMES) for (const item of await local.getAll(store)) rows.push({ store, id: item.id, data: item, deleted: false })
    const settings = await local.getSettings()
    if (settings) rows.push({ store: 'settings', id: 'app', data: settings, deleted: false })
    return rows
  }

  async function pushRows(rows: Omit<RemoteRow, 'updated_at'>[]) {
    for (let i = 0; i < rows.length; i += CHUNK) await remote.push(rows.slice(i, i + CHUNK))
  }

  async function pushOutbox() {
    const ops = await outbox.list()
    for (let i = 0; i < ops.length; i += CHUNK) {
      const chunk = ops.slice(i, i + CHUNK)
      const rows: Omit<RemoteRow, 'updated_at'>[] = []
      for (const op of chunk) rows.push(await rowFor(op))
      await remote.push(rows)
      await outbox.remove(chunk)
    }
  }

  async function rowFor(op: OutboxOp): Promise<Omit<RemoteRow, 'updated_at'>> {
    if (!op.deleted) {
      const rec = op.store === 'settings' ? await local.getSettings() : await local.get(op.store, op.id)
      if (rec) return { store: op.store, id: op.id, data: rec, deleted: false }
    }
    return { store: op.store, id: op.id, data: null, deleted: true } // apagado (ou sumiu) localmente
  }

  async function apply(rows: RemoteRow[]) {
    for (const r of rows) {
      if (r.store === 'settings') {
        if (!r.deleted && r.data) await local.saveSettings(r.data as Settings)
      } else if ((STORE_NAMES as string[]).includes(r.store)) {
        const store = r.store as StoreName
        if (r.deleted) await local.remove(store, r.id)
        else if (r.data) await local.put(store, r.data as Entities[typeof store])
      }
    }
    if (rows.length) onApplied()
  }

  async function pull() {
    const saved = cursor.get()
    let after = saved ? new Date(Date.parse(saved) - OVERLAP_MS).toISOString() : null
    let newest = saved
    for (;;) {
      const rows = await remote.pull(after, PAGE)
      await apply(rows)
      if (rows.length) {
        after = rows[rows.length - 1].updated_at
        newest = after
      }
      if (rows.length < PAGE) break
    }
    if (newest && newest !== saved) cursor.set(newest)
  }

  async function cycle() {
    if (replacePending.get()) {
      // importação/zerar: a nuvem passa a ser exatamente o que há aqui
      await remote.wipe()
      await pushRows(await everything())
      await outbox.clear()
      replacePending.set(false)
      cursor.set(null)
    } else if (cursor.get() === null) {
      // primeira vez deste aparelho: sobe o que já existe aqui (união com o que a nuvem tiver)
      await pushRows(await everything())
      await outbox.clear()
    } else {
      await pushOutbox()
    }
    await pull()
  }

  /** Envia o que está pendente e recebe o que mudou. Chamadas seguidas viram uma só (e uma rodada extra se algo mudou no meio). */
  function syncNow(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      await setStatus({ state: 'syncing', error: undefined })
      try {
        do {
          again = false
          await cycle()
        } while (again)
        await setStatus({ state: 'idle', lastSync: Date.now(), error: undefined })
      } catch (e) {
        await setStatus(isNetworkError(e) ? { state: 'offline', error: undefined } : { state: 'error', error: String((e as Error)?.message ?? e) })
      } finally {
        running = null
      }
    })()
    return running
  }

  return {
    syncNow,
    getStatus: () => status,
    refreshPending: () => setStatus({}),
  }
}

/**
 * Embrulha o armazenamento local: toda gravação continua indo direto ao IndexedDB (o app segue funcionando sem internet)
 * e, além disso, entra na fila de envio. `onDirty` agenda a sincronização.
 */
export function createSyncedStorage(raw: Storage, outbox: Outbox, hooks: { onDirty: () => void; onReplace: () => void }): Storage {
  const mark = async (store: StoreName | 'settings', id: string, deleted: boolean) => {
    await outbox.add({ store, id, deleted })
    hooks.onDirty()
  }
  return {
    getAll: (s) => raw.getAll(s),
    get: (s, id) => raw.get(s, id),
    getSettings: () => raw.getSettings(),
    snapshot: (): Promise<Snapshot> => raw.snapshot(),
    async put(store, item) {
      await raw.put(store, item)
      await mark(store, item.id, false)
    },
    async putMany(store, items) {
      await raw.putMany(store, items)
      for (const i of items) await outbox.add({ store, id: i.id, deleted: false })
      hooks.onDirty()
    },
    async remove(store, id) {
      await raw.remove(store, id)
      await mark(store, id, true)
    },
    async saveSettings(settings) {
      await raw.saveSettings(settings)
      await mark('settings', 'app', false)
    },
    async restore(snap) {
      await raw.restore(snap)
      await outbox.clear() // o que estava na fila não vale mais: a nuvem será substituída por inteiro
      hooks.onReplace()
      hooks.onDirty()
    },
  }
}
