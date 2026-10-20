import { describe, expect, it } from 'vitest'
import { summarizeMonth } from '../src/domain/month'
import { buildTithe, entersTithe, summarizeTithe, titheAmount } from '../src/domain/tithe'
import type { Transaction } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
const income: Transaction = {
  id: 'in1', createdAt: 'x', updatedAt: 'x', tipo: 'entrada', valorCents: 400_000, moeda: 'USD', data: '2026-10-05',
  categoriaId: 'trab', descricao: 'Salário', pessoa: 'eu', dizimo: true, cambio: perUSD,
}

describe('dízimo', () => {
  it('calcula 10% em centavos, arredondando', () => {
    expect(titheAmount(400_000, 1000)).toBe(40_000)
    expect(titheAmount(12_345, 1000)).toBe(1_235) // 123,45 → 12,345 → 12,35
    expect(titheAmount(100, 0)).toBe(0)
    expect(titheAmount(100_000, 1250)).toBe(12_500) // 12,5%
  })
  it('gera a saída ligada à entrada, na mesma moeda, data, pessoa e câmbio', () => {
    const d = buildTithe(income, { now: 'n', categoriaId: 'cat', bps: 1000 })
    expect(d).toMatchObject({ id: 'dz-in1', tipo: 'saida', valorCents: 40_000, moeda: 'USD', data: '2026-10-05', pessoa: 'eu', categoriaId: 'cat', dizimoDeId: 'in1', descricao: 'Dízimo · Salário', cambio: perUSD })
  })
  it('atualizar reaproveita o mesmo registro (não duplica)', () => {
    const first = buildTithe(income, { now: 'n1', categoriaId: 'cat', bps: 1000 })
    const again = buildTithe({ ...income, valorCents: 500_000 }, { now: 'n2', categoriaId: 'cat', bps: 1000, existing: first })
    expect(again.id).toBe(first.id)
    expect(again.createdAt).toBe('n1')
    expect(again.valorCents).toBe(50_000)
  })
  it('o resumo do mês separa o dízimo dentro das saídas', () => {
    const d = buildTithe(income, { now: 'n', categoriaId: 'cat', bps: 1000 })
    const s = summarizeMonth({ mes: '2026-10', transactions: [income, d], bills: [], rates: perUSD, moeda: 'BRL', pessoa: 'todos' })
    expect(s.entradas).toBe(2_000_000)
    expect(s.saidas).toBe(200_000)
    expect(s.dizimo).toBe(200_000)
    expect(s.saldo).toBe(1_800_000)
  })
})

describe('dízimo automático', () => {
  it('toda entrada entra, inclusive as antigas sem o campo; só sai com false', () => {
    const { dizimo: _d, ...legacy } = income
    expect(entersTithe(income)).toBe(true)
    expect(entersTithe(legacy as Transaction)).toBe(true)
    expect(entersTithe({ ...income, dizimo: false })).toBe(false)
    expect(entersTithe({ ...income, tipo: 'saida' })).toBe(false)
    expect(entersTithe({ ...income, dizimoDeId: 'x' })).toBe(false)
  })
  it('o id do dízimo é fixo por entrada: recalcular nunca duplica', () => {
    const a = buildTithe(income, { now: 'n1', categoriaId: 'c', bps: 1000 })
    const b = buildTithe(income, { now: 'n2', categoriaId: 'c', bps: 1000 })
    expect(a.id).toBe(b.id)
  })
  it('entrada antiga sem o campo entra na base do resumo', () => {
    const { dizimo: _d, ...legacy } = income
    const s = summarizeTithe({ mes: '2026-10', transactions: [legacy as Transaction], moeda: 'BRL', pessoa: 'todos' })
    expect(s.base).toBe(2_000_000)
    expect(s.semDizimo.base).toBe(0)
  })
})
