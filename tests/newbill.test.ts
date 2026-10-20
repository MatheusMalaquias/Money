import { describe, expect, it } from 'vitest'
import { planNewBill } from '../src/domain/bills'
import type { Bill } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
let n = 0
const newId = () => `n${++n}`
const bill = (o: Partial<Bill> = {}): Bill => ({
  id: 'b1', createdAt: 'x', updatedAt: 'x', descricao: 'Internet', valorCents: 12_000, moeda: 'BRL', vencimento: '2026-10-10', diaAncora: 10,
  categoriaId: 'c', pessoa: 'casal', recorrencia: 'mensal', status: 'pendente', serieId: 's1', ...o,
})
const deps = { now: 'n', perUSD, newId }

describe('cadastrar conta nova', () => {
  it('pendente: grava só a conta', () => {
    const r = planNewBill(bill(), [], deps)
    expect(r.bills).toHaveLength(1)
    expect(r.bills[0].status).toBe('pendente')
    expect(r.transaction).toBeUndefined()
  })
  it('já paga: nasce paga, gera a saída e a próxima mensal', () => {
    const r = planNewBill(bill(), [], { ...deps, paidOn: '2026-10-09' })
    const paga = r.bills.find((b) => b.id === 'b1')!
    expect(paga).toMatchObject({ status: 'paga', pagaEm: '2026-10-09', transacaoId: r.transaction!.id })
    expect(r.transaction).toMatchObject({ tipo: 'saida', valorCents: 12_000, data: '2026-10-09', contaId: 'b1' })
    expect(r.bills.filter((b) => b.status === 'pendente').map((b) => b.vencimento)).toEqual(['2026-11-10'])
  })
  it('já paga e única: não gera próxima', () => {
    const r = planNewBill(bill({ recorrencia: 'unica' }), [], { ...deps, paidOn: '2026-10-09' })
    expect(r.bills).toHaveLength(1)
    expect(r.bills[0].status).toBe('paga')
  })
  it('parcelas com fim: a primeira já paga e as demais pendentes, sem duplicar', () => {
    const r = planNewBill(bill({ fim: '2026-12-10' }), [], { ...deps, paidOn: '2026-10-09' })
    expect(r.bills.map((b) => `${b.vencimento}:${b.status}`).sort()).toEqual(['2026-10-10:paga', '2026-11-10:pendente', '2026-12-10:pendente'])
  })
})
