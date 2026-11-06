import { describe, expect, it } from 'vitest'
import { summarizeBudget } from '../src/domain/budget'
import { buildSalaryTx, nextSalaryDate, salaryMonths, salaryTxId } from '../src/domain/salary'
import type { Bill, Salary, Transaction } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
const sal: Salary = { id: 's1', descricao: 'Salário', valorCents: 400_000, moeda: 'USD', pessoa: 'matheus', categoriaId: 'trab', dia: 5, inicio: '2026-08' }

describe('salário fixo', () => {
  it('cria um mês por vez, só depois do dia combinado', () => {
    expect(salaryMonths(sal, '2026-10-04')).toEqual(['2026-08', '2026-09'])
    expect(salaryMonths(sal, '2026-10-05')).toEqual(['2026-08', '2026-09', '2026-10'])
  })
  it('respeita o fim e os meses apagados à mão', () => {
    expect(salaryMonths({ ...sal, fim: '2026-09' }, '2026-12-20')).toEqual(['2026-08', '2026-09'])
    expect(salaryMonths({ ...sal, puladas: ['2026-09'] }, '2026-10-20')).toEqual(['2026-08', '2026-10'])
  })
  it('dia 31 cai no último dia do mês curto', () => {
    const s = { ...sal, dia: 31, inicio: '2026-02' }
    expect(buildSalaryTx(s, '2026-02', { now: 'n', perUSD }).data).toBe('2026-02-28')
    expect(salaryMonths(s, '2026-02-27')).toEqual([])
  })
  it('a entrada tem id fixo, entra no dízimo e guarda o câmbio', () => {
    const t = buildSalaryTx(sal, '2026-09', { now: 'n', perUSD })
    expect(t).toMatchObject({ id: salaryTxId('s1', '2026-09'), tipo: 'entrada', valorCents: 400_000, moeda: 'USD', data: '2026-09-05', dizimo: true, salarioId: 's1', cambio: perUSD })
    expect(buildSalaryTx({ ...sal, dizimo: false }, '2026-09', { now: 'n', perUSD }).dizimo).toBe(false)
  })
  it('mostra a próxima data', () => {
    expect(nextSalaryDate(sal, '2026-10-04')).toBe('2026-10-05')
    expect(nextSalaryDate(sal, '2026-10-06')).toBe('2026-11-05')
    expect(nextSalaryDate({ ...sal, fim: '2026-10' }, '2026-10-06')).toBeNull()
  })
})

const tx = (o: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), createdAt: 'x', updatedAt: 'x', tipo: 'saida', valorCents: 0, moeda: 'BRL', data: '2026-10-10', categoriaId: 'mercado', descricao: '', pessoa: 'gabi', cambio: perUSD, ...o })
const bill = (o: Partial<Bill>): Bill => ({ id: Math.random().toString(), createdAt: 'x', updatedAt: 'x', descricao: '', valorCents: 0, moeda: 'BRL', vencimento: '2026-10-20', diaAncora: 20, categoriaId: 'mercado', pessoa: 'gabi', recorrencia: 'unica', status: 'pendente', serieId: 's', ...o })

describe('orçamento por categoria', () => {
  const args = { mes: '2026-10', rates: perUSD, moeda: 'BRL' as const }
  const budgets = [{ categoriaId: 'mercado', valorCents: 100_000, moeda: 'BRL' as const }]
  it('soma o gasto do mês, sem dízimo, e as contas pendentes', () => {
    const s = summarizeBudget({ ...args, budgets, transactions: [tx({ valorCents: 30_000 }), tx({ valorCents: 5_000, dizimoDeId: 'x' }), tx({ valorCents: 9_000, data: '2026-09-30' })], bills: [bill({ valorCents: 20_000 })] })
    expect(s.rows[0]).toMatchObject({ limite: 100_000, gasto: 30_000, previsto: 20_000, restante: 50_000, nivel: 'ok' })
  })
  it('níveis: perto, passa e estourou', () => {
    const nivel = (gasto: number, previsto = 0) => summarizeBudget({ ...args, budgets, transactions: [tx({ valorCents: gasto })], bills: previsto ? [bill({ valorCents: previsto })] : [] }).rows[0].nivel
    expect(nivel(79_999)).toBe('ok')
    expect(nivel(80_000)).toBe('perto')
    expect(nivel(60_000, 50_000)).toBe('passa')
    expect(nivel(100_001)).toBe('estourou')
  })
  it('converte o limite de outra moeda e lista o que não tem limite', () => {
    const s = summarizeBudget({ ...args, budgets: [{ categoriaId: 'lazer', valorCents: 10_000, moeda: 'USD' }], transactions: [tx({ valorCents: 7_000 })], bills: [] })
    expect(s.rows[0].limite).toBe(50_000)
    expect(s.semLimite).toEqual([{ categoriaId: 'mercado', total: 7_000 }])
  })
  it('contas pagas não contam em dobro', () => {
    const s = summarizeBudget({ ...args, budgets, transactions: [tx({ valorCents: 30_000 })], bills: [bill({ valorCents: 30_000, status: 'paga' })] })
    expect(s.rows[0]).toMatchObject({ gasto: 30_000, previsto: 0 })
  })
})
