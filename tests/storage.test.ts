import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../src/domain/defaults'
import type { Bill } from '../src/domain/types'
import { createIndexedDBStorage } from '../src/storage/indexeddb'
import { createMemoryStorage } from '../src/storage/memory'
import type { Storage } from '../src/storage/types'

const bill = (id: string): Bill => ({
  id, createdAt: 'x', updatedAt: 'x', descricao: 'Luz', valorCents: 9990, moeda: 'BRL', vencimento: '2026-10-10',
  diaAncora: 10, categoriaId: 'c', pessoa: 'eu', recorrencia: 'mensal', status: 'pendente', serieId: 's',
})

// o mesmo contrato roda nas duas implementações
const impls: [string, () => Promise<Storage>][] = [
  ['memória', async () => createMemoryStorage()],
  ['IndexedDB', async () => createIndexedDBStorage(`t${Math.random()}`)],
]

describe.each(impls)('Storage (%s)', (_n, make) => {
  it('grava, lista, atualiza e remove', async () => {
    const s = await make()
    await s.put('bills', bill('a'))
    await s.putMany('bills', [bill('b'), bill('c')])
    expect((await s.getAll('bills')).map((b) => b.id).sort()).toEqual(['a', 'b', 'c'])
    await s.put('bills', { ...bill('a'), valorCents: 1 })
    expect((await s.getAll('bills')).find((b) => b.id === 'a')!.valorCents).toBe(1)
    await s.remove('bills', 'b')
    expect(await s.getAll('bills')).toHaveLength(2)
  })
  it('guarda configurações', async () => {
    const s = await make()
    expect(await s.getSettings()).toBeNull()
    await s.saveSettings(defaultSettings())
    expect((await s.getSettings())!.moedaExibicao).toBe('BRL')
  })
  it('snapshot e restore fazem ida e volta', async () => {
    const a = await make()
    await a.put('bills', bill('x'))
    await a.saveSettings(defaultSettings())
    const snap = await a.snapshot()
    const b = await make()
    await b.put('bills', bill('velha'))
    await b.restore(snap)
    expect((await b.getAll('bills')).map((i) => i.id)).toEqual(['x'])
    expect((await b.getSettings())!.schemaVersion).toBe(1)
  })
})
