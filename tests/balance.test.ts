import { describe, expect, it } from 'vitest'
import { endOfMonth, summarizeTotals } from '../src/domain/balance'
import { summarizeMonth } from '../src/domain/month'
import type { Transaction } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
const t = (o: Partial<Transaction>): Transaction => ({
  id: 'x', createdAt: 'c', updatedAt: 'u', tipo: 'entrada', valorCents: 0, moeda: 'BRL', data: '2026-10-05', categoriaId: 'c',
  descricao: '', pessoa: 'matheus', cambio: perUSD, ...o,
})
const base = { moeda: 'BRL' as const, pessoa: 'todos' as const, ate: endOfMonth('2026-10') }

describe('total que temos', () => {
  const txs = [
    t({ id: '1', valorCents: 400_000, moeda: 'USD' }), // US$ 4.000 → R$ 20.000
    t({ id: '2', valorCents: 300_000, pessoa: 'gabi' }), // R$ 3.000
    t({ id: '3', tipo: 'saida', valorCents: 40_000, moeda: 'USD', dizimoDeId: '1' }), // dízimo US$ 400 → R$ 2.000
    t({ id: '4', tipo: 'saida', valorCents: 30_000, pessoa: 'gabi', dizimoDeId: '2' }), // dízimo R$ 300
    t({ id: '5', tipo: 'saida', valorCents: 100_000, pessoa: 'casal' }), // aluguel R$ 1.000
  ]
  it('soma as duas pessoas já depois do dízimo e dos gastos', () => {
    const r = summarizeTotals({ ...base, transactions: txs })
    expect(r.total).toBe(2_000_000 + 300_000 - 200_000 - 30_000 - 100_000)
    expect(r.porPessoa).toContainEqual({ pessoa: 'matheus', total: 1_800_000 })
    expect(r.porPessoa).toContainEqual({ pessoa: 'gabi', total: 270_000 })
    expect(r.porPessoa).toContainEqual({ pessoa: 'casal', total: -100_000 })
  })
  it('reserva separa uma parte do total, sem ser gasto', () => {
    const r = summarizeTotals({ ...base, transactions: [...txs, t({ id: '6', tipo: 'reserva', valorCents: 500_000 })] })
    expect(r.total).toBe(1_970_000) // não muda
    expect(r.reserva).toBe(500_000)
    expect(r.disponivel).toBe(1_470_000)
  })
  it('retirada devolve da reserva ao disponível', () => {
    const r = summarizeTotals({ ...base, transactions: [...txs, t({ id: '6', tipo: 'reserva', valorCents: 500_000 }), t({ id: '7', tipo: 'reserva', retirada: true, valorCents: 200_000 })] })
    expect(r.reserva).toBe(300_000)
    expect(r.disponivel).toBe(1_670_000)
  })
  it('acumula meses anteriores e ignora o que é depois', () => {
    const all = [t({ id: 'a', valorCents: 100_000, data: '2026-09-10' }), t({ id: 'b', valorCents: 50_000, data: '2026-10-10' }), t({ id: 'c', valorCents: 70_000, data: '2026-11-02' })]
    expect(summarizeTotals({ ...base, transactions: all }).total).toBe(150_000)
    expect(summarizeTotals({ ...base, ate: endOfMonth('2026-11'), transactions: all }).total).toBe(220_000)
  })
  it('filtra por pessoa', () => {
    expect(summarizeTotals({ ...base, pessoa: 'gabi', transactions: txs }).total).toBe(300_000 - 30_000)
  })
  it('a reserva não conta como entrada nem saída do mês', () => {
    const s = summarizeMonth({ mes: '2026-10', transactions: [t({ tipo: 'reserva', valorCents: 99_999 })], bills: [], rates: perUSD, moeda: 'BRL', pessoa: 'todos' })
    expect(s.entradas).toBe(0)
    expect(s.saidas).toBe(0)
  })
})
