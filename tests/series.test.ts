import { describe, expect, it } from 'vitest'
import { payBill, reconcileSeries } from '../src/domain/bills'
import { occurrences } from '../src/domain/recurrence'
import { summarizeTithe } from '../src/domain/tithe'
import type { Bill, Transaction } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
let n = 0
const newId = () => `n${++n}`
const bill = (o: Partial<Bill> = {}): Bill => ({
  id: 'b1', createdAt: 'x', updatedAt: 'x', descricao: 'Financiamento', valorCents: 80_000, moeda: 'BRL',
  vencimento: '2026-11-10', diaAncora: 10, categoriaId: 'c', pessoa: 'matheus', recorrencia: 'mensal',
  status: 'pendente', serieId: 's1', ...o,
})

describe('conta com data final (parcelas)', () => {
  it('lista os vencimentos até o mês final, inclusive', () => {
    expect(occurrences('2026-11-10', 'mensal', 10, '2027-01-10')).toEqual(['2026-11-10', '2026-12-10', '2027-01-10'])
    expect(occurrences('2026-11-10', 'mensal', 10, '2026-11-10')).toEqual(['2026-11-10'])
  })
  it('respeita o dia âncora em meses curtos', () => {
    expect(occurrences('2027-01-31', 'mensal', 31, '2027-03-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })
  it('anual com fim', () => {
    expect(occurrences('2026-10-20', 'anual', 20, '2028-10-20')).toHaveLength(3)
  })
  it('criar com fim gera todas as parcelas que faltam', () => {
    const b = bill({ fim: '2027-01-10' })
    const { add, removeIds } = reconcileSeries(b, [], { now: 'n', newId })
    expect(add.map((x) => x.vencimento)).toEqual(['2026-12-10', '2027-01-10'])
    expect(add.every((x) => x.serieId === 's1' && x.status === 'pendente' && x.valorCents === 80_000)).toBe(true)
    expect(removeIds).toEqual([])
  })
  it('sem fim ou única não gera nada', () => {
    expect(reconcileSeries(bill(), [], { now: 'n', newId }).add).toEqual([])
    expect(reconcileSeries(bill({ recorrencia: 'unica', fim: '2027-01-10' }), [], { now: 'n', newId }).add).toEqual([])
  })
  it('não duplica parcelas que já existem', () => {
    const b = bill({ fim: '2027-01-10' })
    const existing = bill({ id: 'b2', vencimento: '2026-12-10' })
    expect(reconcileSeries(b, [b, existing], { now: 'n', newId }).add.map((x) => x.vencimento)).toEqual(['2027-01-10'])
  })
  it('encurtar o fim remove as pendentes que passaram, mas mantém as pagas', () => {
    const b = bill({ fim: '2026-12-10' })
    const later = bill({ id: 'b3', vencimento: '2027-01-10' })
    const paidLater = bill({ id: 'b4', vencimento: '2027-02-10', status: 'paga' })
    expect(reconcileSeries(b, [b, later, paidLater], { now: 'n', newId }).removeIds).toEqual(['b3'])
  })
  it('pagar a última parcela não cria outra', () => {
    const r = payBill(bill({ vencimento: '2027-01-10', fim: '2027-01-10' }), { now: 'n', today: '2027-01-09', perUSD, newId })
    expect(r.next).toBeUndefined()
  })
  it('pagar não recria a próxima se ela já existe na série', () => {
    const b = bill({ fim: '2027-01-10' })
    const next = bill({ id: 'b2', vencimento: '2026-12-10' })
    expect(payBill(b, { now: 'n', today: '2026-11-09', perUSD, newId, series: [b, next] }).next).toBeUndefined()
  })
  it('sem fim continua gerando a próxima ao pagar', () => {
    expect(payBill(bill(), { now: 'n', today: '2026-11-09', perUSD, newId, series: [] }).next?.vencimento).toBe('2026-12-10')
  })
})

describe('resumo do dízimo', () => {
  const t = (o: Partial<Transaction>): Transaction => ({
    id: 'x', createdAt: 'c', updatedAt: 'u', tipo: 'saida', valorCents: 0, moeda: 'BRL', data: '2026-10-05', categoriaId: 'd',
    descricao: '', pessoa: 'matheus', cambio: perUSD, ...o,
  })
  const txs: Transaction[] = [
    t({ id: 'i1', tipo: 'entrada', valorCents: 400_000, moeda: 'USD', dizimo: true, pessoa: 'matheus' }), // US$ 4.000 → R$ 20.000
    t({ id: 'd1', valorCents: 40_000, moeda: 'USD', dizimoDeId: 'i1', pessoa: 'matheus' }), // US$ 400 → R$ 2.000
    t({ id: 'i2', tipo: 'entrada', valorCents: 300_000, dizimo: true, pessoa: 'gabi' }),
    t({ id: 'd2', valorCents: 30_000, dizimoDeId: 'i2', pessoa: 'gabi' }),
    t({ id: 'i3', tipo: 'entrada', valorCents: 100_000, dizimo: false, pessoa: 'gabi' }), // sem dízimo: fora da base
    t({ id: 'd3', valorCents: 20_000, dizimoDeId: 'i9', pessoa: 'gabi', data: '2026-03-01' }), // março, mesmo ano
    t({ id: 'm', valorCents: 99_999 }), // gasto comum: não é dízimo
  ]
  const base = { mes: '2026-10', transactions: txs, moeda: 'BRL' as const }

  it('todos: soma o casal, separa por pessoa e converte pelo câmbio', () => {
    const s = summarizeTithe({ ...base, pessoa: 'todos' })
    expect(s.total).toBe(200_000 + 30_000)
    expect(s.base).toBe(2_000_000 + 300_000)
    expect(s.porPessoa).toEqual([{ pessoa: 'matheus', total: 200_000 }, { pessoa: 'gabi', total: 30_000 }])
    expect(s.porMoeda).toEqual({ BRL: 30_000, USD: 40_000, EUR: 0 })
    expect(s.itens.map((i) => i.id).sort()).toEqual(['d1', 'd2'])
  })
  it('por pessoa', () => {
    expect(summarizeTithe({ ...base, pessoa: 'gabi' }).total).toBe(30_000)
    expect(summarizeTithe({ ...base, pessoa: 'matheus' }).total).toBe(200_000)
  })
  it('o ano inclui outros meses do mesmo ano', () => {
    expect(summarizeTithe({ ...base, pessoa: 'gabi' }).ano).toBe(30_000 + 20_000)
  })
})

import { dedupeCategories } from '../src/domain/categories'
import type { Category } from '../src/domain/types'

describe('categorias duplicadas', () => {
  const cat = (id: string, nome: string, ordem: number, chave?: 'dizimo'): Category => ({ id, createdAt: 'x', updatedAt: 'x', nome, cor: '#000', ordem, chave })
  it('une as repetidas, ficando com a mais usada', () => {
    const { keep, remap } = dedupeCategories([cat('a1', 'Moradia', 0), cat('a2', 'moradia', 9), cat('b1', 'Lazer', 1)], new Map([['a2', 5]]))
    expect(keep.map((c) => c.id).sort()).toEqual(['a2', 'b1'])
    expect(remap.get('a1')).toBe('a2')
  })
  it('sem uso, fica a de menor ordem; categoria do sistema é unida pela chave', () => {
    const { keep, remap } = dedupeCategories([cat('d1', 'Dízimo', 8, 'dizimo'), cat('d2', 'Minha doação', 2, 'dizimo')], new Map())
    expect(keep.map((c) => c.id)).toEqual(['d2'])
    expect(remap.get('d1')).toBe('d2')
  })
  it('sem duplicadas não muda nada', () => {
    expect(dedupeCategories([cat('a', 'A', 0), cat('b', 'B', 1)], new Map()).remap.size).toBe(0)
  })
})
