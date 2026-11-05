import { describe, expect, it } from 'vitest'
import { buildAlerts } from '../src/domain/alerts'
import { addDays } from '../src/domain/dates'
import { defaultSettings } from '../src/domain/defaults'
import { monthlyNeed } from '../src/domain/goals'
import { averageLeftover, categorySpend, evolution, monthlySeries, transactionsToCSV } from '../src/domain/reports'
import type { Category, Goal, Transaction } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
const t = (o: Partial<Transaction>): Transaction => ({
  id: 'x', createdAt: 'c', updatedAt: 'u', tipo: 'saida', valorCents: 0, moeda: 'BRL', data: '2026-10-05', categoriaId: 'a', descricao: '', pessoa: 'matheus', cambio: perUSD, ...o,
})
const base = { moeda: 'BRL' as const, pessoa: 'todos' as const, mes: '2026-10' }

describe('séries mensais', () => {
  const txs = [
    t({ id: '1', tipo: 'entrada', valorCents: 100_000, data: '2026-10-01' }),
    t({ id: '2', valorCents: 10_000, dizimoDeId: '1', data: '2026-10-01' }),
    t({ id: '3', valorCents: 30_000, data: '2026-10-10' }),
    t({ id: '4', tipo: 'entrada', valorCents: 50_000, data: '2026-09-05' }),
    t({ id: '5', valorCents: 99_999, tipo: 'reserva', data: '2026-10-12' }), // reserva fica de fora
    t({ id: '6', valorCents: 7_000, data: '2026-03-01' }), // fora da janela de 6 meses
  ]
  it('devolve 6 meses seguidos, do mais antigo ao mais novo, mesmo os vazios', () => {
    const r = monthlySeries({ ...base, transactions: txs })
    expect(r.map((x) => x.mes)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(r[1]).toEqual({ mes: '2026-06', recebido: 0, dizimo: 0, gastos: 0, sobra: 0 })
  })
  it('separa recebido, dízimo e gastos e calcula a sobra', () => {
    const r = monthlySeries({ ...base, transactions: txs })
    expect(r[5]).toEqual({ mes: '2026-10', recebido: 100_000, dizimo: 10_000, gastos: 30_000, sobra: 60_000 })
    expect(r[4].sobra).toBe(50_000)
  })
  it('atravessa a virada do ano', () => {
    expect(monthlySeries({ ...base, mes: '2027-02', meses: 4, transactions: [] }).map((x) => x.mes)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('média da sobra só conta meses com movimento', () => {
    expect(averageLeftover(monthlySeries({ ...base, transactions: txs }))).toBe(55_000) // (50.000 + 60.000) / 2
    expect(averageLeftover(monthlySeries({ ...base, transactions: [] }))).toBeNull()
  })
  it('gastos por categoria: maior primeiro, sem dízimo e sem reserva', () => {
    const r = categorySpend({ ...base, transactions: [...txs, t({ id: '7', valorCents: 50_000, categoriaId: 'b' })] })
    expect(r).toEqual([{ categoriaId: 'b', total: 50_000 }, { categoriaId: 'a', total: 30_000 }])
  })
  it('evolução do total e da reserva no fim de cada mês', () => {
    const r = evolution({ ...base, meses: 2, transactions: [t({ id: 'a', tipo: 'entrada', valorCents: 100_000, data: '2026-09-10' }), t({ id: 'b', tipo: 'reserva', valorCents: 30_000, data: '2026-10-02' })] })
    expect(r).toEqual([{ mes: '2026-09', total: 100_000, reserva: 0 }, { mes: '2026-10', total: 70_000, reserva: 30_000 }])
  })
})

describe('quanto precisamos guardar', () => {
  const goal = (o: Partial<Goal>): Goal => ({ id: 'g', createdAt: 'c', updatedAt: 'u', nome: 'Meta', alvoCents: 1_200_000, atualCents: 0, moeda: 'BRL', prazo: '2027-10-20', pessoa: 'casal', ...o })
  it('soma por mês de todas as metas em andamento, convertendo', () => {
    const r = monthlyNeed([goal({}), goal({ id: 'h', moeda: 'USD', alvoCents: 120_000 }), goal({ id: 'i', prazo: '2026-01-01' }), goal({ id: 'j', atualCents: 1_200_000 })], '2026-10-20', 'BRL', perUSD)
    expect(r).toEqual({ total: 100_000 + 50_000, count: 2, atrasadas: 1, concluidas: 1 }) // R$ 1.000 + US$ 100 (= R$ 500) por mês
  })
})

describe('alertas do administrador', () => {
  const ok = { atrasadas: { count: 0, total: 0 }, proximas: { count: 0, total: 0 }, sobra: 1, mesesReserva: 6, reserva: 1, metasAtrasadas: 0, faltaGuardar: 0, semEntradasNoMes: false, cambioDesatualizado: false, money: (c: number) => `R$ ${c / 100}` }
  it('sem problemas, a lista é vazia', () => {
    expect(buildAlerts(ok)).toEqual([])
  })
  it('ordena do mais grave ao menos grave', () => {
    const r = buildAlerts({ ...ok, cambioDesatualizado: true, proximas: { count: 2, total: 5_000 }, atrasadas: { count: 1, total: 10_000 }, sobra: -1_000 })
    expect(r.map((a) => a.id)).toEqual(['atrasadas', 'sobra', 'proximas', 'cambio'])
    expect(r[0].titulo).toBe('1 conta atrasada')
  })
  it('reserva baixa só avisa quando há reserva', () => {
    expect(buildAlerts({ ...ok, mesesReserva: 1.2 }).map((a) => a.id)).toEqual(['reserva'])
    expect(buildAlerts({ ...ok, mesesReserva: 1.2, reserva: 0 })).toEqual([])
  })
  it('avisa quando falta guardar mais do que sobra', () => {
    expect(buildAlerts({ ...ok, faltaGuardar: 25_000 })[0]).toMatchObject({ id: 'guardar', detalhe: 'Faltam R$ 250 por mês para cumprir as metas' })
  })
})

describe('datas e exportação', () => {
  it('soma dias atravessando o mês e o ano', () => {
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  const cats: Category[] = [{ id: 'a', createdAt: 'c', updatedAt: 'u', nome: 'Mercado; "bom"', cor: '#000', ordem: 0 }]
  it('CSV: BOM, separador ;, vírgula decimal, aspas escapadas e valor convertido', () => {
    const csv = transactionsToCSV([t({ valorCents: 12_345, moeda: 'USD', descricao: 'Almoço' })], cats, defaultSettings())
    expect(csv.startsWith('﻿Data;Tipo;Descrição;Categoria;Pessoa;Valor;Moeda;Valor em BRL')).toBe(true)
    expect(csv).toContain('05/10/2026;Saída;Almoço;"Mercado; ""bom""";Matheus;123,45;USD;617,25')
  })
  it('CSV: texto que começa com = ou + não vira fórmula', () => {
    expect(transactionsToCSV([t({ descricao: '=SOMA(A1)' })], cats, defaultSettings())).toContain(";'=SOMA(A1);")
  })
})
