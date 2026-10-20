import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from '../src/domain/backup'
import { defaultSettings } from '../src/domain/defaults'
import { createMemoryStorage } from '../src/storage/memory'

const tx = { id: 't', createdAt: 'x', updatedAt: 'x', tipo: 'saida', valorCents: 1234, moeda: 'USD', data: '2026-10-01', categoriaId: 'c', descricao: '', pessoa: 'eu', cambio: { USD: 1, BRL: 5, EUR: 0.9 } }

describe('backup', () => {
  it('exporta e importa sem perder nada (ida e volta)', async () => {
    const a = createMemoryStorage()
    await a.saveSettings(defaultSettings())
    await a.put('transactions', tx as never)
    const json = JSON.stringify(buildBackup(await a.snapshot(), '2026-10-20T00:00:00Z'))
    const b = createMemoryStorage()
    await b.restore(parseBackup(json))
    expect(await b.getAll('transactions')).toEqual([tx])
    expect((await b.getSettings())!.moedaExibicao).toBe('BRL')
  })
  it('rejeita arquivos que não são backup', () => {
    expect(() => parseBackup('não é json')).toThrow('JSON válido')
    expect(() => parseBackup('{"foo":1}')).toThrow('não é um backup')
    expect(() => parseBackup('{"app":"money","version":99,"data":{}}')).toThrow('versão mais nova')
  })
  it('rejeita valor monetário que não é inteiro (centavos)', () => {
    const bad = { app: 'money', version: 1, data: { transactions: [{ ...tx, valorCents: 12.34 }] }, settings: null }
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('valorCents')
  })
  it('aceita coleções ausentes como vazias', () => {
    const s = parseBackup('{"app":"money","version":1,"data":{},"settings":null}')
    expect(s.data.bills).toEqual([])
  })
})
