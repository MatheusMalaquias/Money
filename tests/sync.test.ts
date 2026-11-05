import { describe, expect, it } from 'vitest'
import { createSync, createSyncedStorage, type Remote, type RemoteRow } from '../src/cloud/sync'
import { defaultSettings } from '../src/domain/defaults'
import type { Bill } from '../src/domain/types'
import { createMemoryOutbox, createMemoryStorage } from '../src/storage/memory'

/** Nuvem falsa: guarda linhas e carimba cada gravação com um relógio crescente (como o servidor faria). */
function fakeCloud() {
  const rows = new Map<string, RemoteRow>()
  let clock = 0
  const stamp = () => new Date(Date.UTC(2026, 10, 1) + ++clock * 1000).toISOString()
  const calls = { push: 0, pull: 0, wipe: 0 }
  let offline = false
  const remote: Remote = {
    async pull(after, limit) {
      calls.pull++
      if (offline) throw new TypeError('Failed to fetch')
      return [...rows.values()].filter((r) => !after || r.updated_at > after).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit)
    },
    async push(list) {
      calls.push++
      if (offline) throw new TypeError('Failed to fetch')
      for (const r of list) rows.set(`${r.store}:${r.id}`, { ...r, updated_at: stamp() })
    },
    async wipe() {
      calls.wipe++
      rows.clear()
    },
  }
  return { remote, rows, calls, setOffline: (v: boolean) => (offline = v) }
}

const bill = (id: string, valor = 1000): Bill => ({
  id, createdAt: 'x', updatedAt: 'x', descricao: id, valorCents: valor, moeda: 'BRL', vencimento: '2026-11-10', diaAncora: 10,
  categoriaId: 'c', pessoa: 'casal', recorrencia: 'unica', status: 'pendente', serieId: id,
})

/** Um aparelho: armazenamento local + fila + motor. */
function device(cloud: ReturnType<typeof fakeCloud>) {
  const raw = createMemoryStorage()
  const outbox = createMemoryOutbox()
  let cursor: string | null = null
  let replace = false
  let applied = 0
  const sync = createSync({
    local: raw, outbox, remote: cloud.remote,
    cursor: { get: () => cursor, set: (v) => (cursor = v) },
    replacePending: { get: () => replace, set: (v) => (replace = v) },
    onApplied: () => applied++,
  })
  const storage = createSyncedStorage(raw, outbox, { onDirty: () => {}, onReplace: () => (replace = true) })
  return { raw, outbox, storage, sync, applied: () => applied, cursor: () => cursor, replacePending: () => replace }
}

describe('sincronização entre aparelhos', () => {
  it('o que um aparelho grava aparece no outro', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    await a.sync.syncNow()
    await b.sync.syncNow() // os dois já fizeram a primeira rodada
    await a.storage.put('bills', bill('luz'))
    await a.sync.syncNow()
    await b.sync.syncNow()
    expect((await b.raw.getAll('bills')).map((x) => x.id)).toEqual(['luz'])
    expect(b.applied()).toBeGreaterThan(0)
  })
  it('editar e apagar também chegam ao outro', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    await a.sync.syncNow()
    await b.sync.syncNow()
    await a.storage.put('bills', bill('luz', 1000))
    await a.storage.put('bills', bill('agua', 500))
    await a.sync.syncNow()
    await b.sync.syncNow()
    await a.storage.put('bills', bill('luz', 2500))
    await a.storage.remove('bills', 'agua')
    await a.sync.syncNow()
    await b.sync.syncNow()
    const got = await b.raw.getAll('bills')
    expect(got.map((x) => `${x.id}:${x.valorCents}`)).toEqual(['luz:2500'])
  })
  it('as configurações também sincronizam', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    await a.sync.syncNow()
    await b.sync.syncNow()
    await a.storage.saveSettings({ ...defaultSettings(), dizimoBps: 1250 })
    await a.sync.syncNow()
    await b.sync.syncNow()
    expect((await b.raw.getSettings())!.dizimoBps).toBe(1250)
  })
  it('primeira vez: sobe o que já existe no aparelho e a fila zera', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    await a.raw.put('bills', bill('antiga')) // dado de antes de ligar a nuvem
    await a.sync.syncNow()
    expect(cloud.rows.has('bills:antiga')).toBe(true)
    expect(await a.outbox.list()).toEqual([])
    expect(a.cursor()).not.toBeNull()
  })
  it('um aparelho novo recebe tudo o que a nuvem já tem', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    await a.raw.put('bills', bill('um'))
    await a.raw.put('bills', bill('dois'))
    await a.sync.syncNow()
    const b = device(cloud)
    await b.sync.syncNow()
    expect((await b.raw.getAll('bills')).map((x) => x.id).sort()).toEqual(['dois', 'um'])
  })
  it('sem internet nada se perde: fica na fila e sobe quando voltar', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    await a.sync.syncNow()
    cloud.setOffline(true)
    await a.storage.put('bills', bill('offline'))
    await a.sync.syncNow()
    expect(a.sync.getStatus()).toMatchObject({ state: 'offline', pending: 1 })
    expect(cloud.rows.has('bills:offline')).toBe(false)
    cloud.setOffline(false)
    await a.sync.syncNow()
    expect(cloud.rows.has('bills:offline')).toBe(true)
    expect(a.sync.getStatus()).toMatchObject({ state: 'idle', pending: 0 })
  })
  it('várias edições do mesmo registro viram um envio só', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    await a.sync.syncNow()
    for (let i = 1; i <= 5; i++) await a.storage.put('bills', bill('luz', i * 100))
    expect(await a.outbox.list()).toHaveLength(1)
    await a.sync.syncNow()
    expect((cloud.rows.get('bills:luz')!.data as Bill).valorCents).toBe(500)
  })
  it('importar/zerar substitui a nuvem inteira, inclusive o que o outro aparelho tinha', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    const b = device(cloud)
    await a.storage.put('bills', bill('velha'))
    await a.sync.syncNow()
    await b.sync.syncNow()
    await a.storage.restore({ data: { categories: [], bills: [bill('nova')], transactions: [], goals: [], rules: [] }, settings: null })
    expect(a.replacePending()).toBe(true)
    await a.sync.syncNow()
    expect(cloud.calls.wipe).toBe(1)
    expect([...cloud.rows.keys()]).toEqual(['bills:nova'])
    expect(a.replacePending()).toBe(false)
  })
  it('não perde uma edição feita no meio do envio (fila compara o carimbo)', async () => {
    const out = createMemoryOutbox()
    await out.add({ store: 'bills', id: 'x', deleted: false })
    const lidas = await out.list()
    await out.add({ store: 'bills', id: 'x', deleted: false }) // edição mais nova, depois da leitura
    await out.remove(lidas)
    expect(await out.list()).toHaveLength(1)
  })
  it('um erro que não é de rede aparece como erro, não como "sem conexão"', async () => {
    const cloud = fakeCloud()
    const a = device(cloud)
    cloud.remote.pull = async () => {
      throw new Error('permission denied for table money_records')
    }
    await a.sync.syncNow()
    expect(a.sync.getStatus()).toMatchObject({ state: 'error', error: 'permission denied for table money_records' })
  })
})
