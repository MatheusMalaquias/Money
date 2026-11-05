import { describe, expect, it } from 'vitest'
import { averageMonthlySpend, breakdownTotals, endOfMonth, summarizeBillsDue, summarizeTotals } from '../src/domain/balance'
import { summarizeMonth } from '../src/domain/month'
import type { Bill, Transaction } from '../src/domain/types'

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
  it('guardar na reserva diminui o total e aumenta a reserva (o conjunto não muda)', () => {
    const r = summarizeTotals({ ...base, transactions: [...txs, t({ id: '6', tipo: 'reserva', valorCents: 500_000 })] })
    expect(r.total).toBe(1_970_000 - 500_000)
    expect(r.reserva).toBe(500_000)
    expect(r.junto).toBe(1_970_000)
  })
  it('tirar da reserva devolve ao total', () => {
    const r = summarizeTotals({ ...base, transactions: [...txs, t({ id: '6', tipo: 'reserva', valorCents: 500_000 }), t({ id: '7', tipo: 'reserva', retirada: true, valorCents: 200_000 })] })
    expect(r.reserva).toBe(300_000)
    expect(r.total).toBe(1_970_000 - 300_000)
  })
  it('"já tinha" soma só na reserva, sem mexer no total', () => {
    const sem = summarizeTotals({ ...base, transactions: txs })
    const r = summarizeTotals({ ...base, transactions: [...txs, t({ id: '8', tipo: 'reserva', aporte: true, valorCents: 1_000_000 })] })
    expect(r.total).toBe(sem.total)
    expect(r.reserva).toBe(1_000_000)
    expect(r.junto).toBe(sem.total + 1_000_000)
  })
  it('guardar reduz o total da pessoa que guardou', () => {
    const r = summarizeTotals({ ...base, transactions: [...txs, t({ id: '6', tipo: 'reserva', valorCents: 100_000, pessoa: 'gabi' })] })
    expect(r.porPessoa).toContainEqual({ pessoa: 'gabi', total: 270_000 - 100_000 })
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

describe('contas registradas no cálculo', () => {
  const bill = (o: Partial<Bill>): Bill => ({
    id: 'b', createdAt: 'c', updatedAt: 'u', descricao: 'x', valorCents: 10_000, moeda: 'BRL', vencimento: '2026-10-25', diaAncora: 25,
    categoriaId: 'c', pessoa: 'casal', recorrencia: 'unica', status: 'pendente', serieId: 's', ...o,
  })
  const args = { ate: '2026-10-31', hoje: '2026-10-20', moeda: 'BRL' as const, rates: perUSD, pessoa: 'todos' as const }
  it('soma pendentes até o fim do mês, convertendo, e separa as vencidas', () => {
    const r = summarizeBillsDue({
      ...args,
      bills: [
        bill({ id: '1' }), // R$ 100
        bill({ id: '2', valorCents: 20_000, moeda: 'USD' }), // US$ 200 = R$ 1.000
        bill({ id: '3', vencimento: '2026-10-10' }), // vencida R$ 100
        bill({ id: '4', status: 'paga' }),
        bill({ id: '5', vencimento: '2026-11-05' }), // depois do mês
      ],
    })
    expect(r.total).toBe(10_000 + 100_000 + 10_000)
    expect(r.count).toBe(3)
    expect(r.vencidas).toEqual({ total: 10_000, count: 1 })
  })
  it('filtra por pessoa', () => {
    expect(summarizeBillsDue({ ...args, pessoa: 'gabi', bills: [bill({ pessoa: 'gabi' }), bill({ id: '2', pessoa: 'matheus' })] }).count).toBe(1)
  })
})

describe('gasto médio mensal (meses de reserva)', () => {
  const s = (o: Partial<Transaction>) => t({ tipo: 'saida', ...o })
  it('média dos meses com gasto, sem dízimo', () => {
    const txs = [s({ id: '1', valorCents: 100_000, data: '2026-10-05' }), s({ id: '2', valorCents: 300_000, data: '2026-09-05' }), s({ id: '3', valorCents: 999_999, data: '2026-10-06', dizimoDeId: 'x' })]
    expect(averageMonthlySpend({ transactions: txs, mes: '2026-10', moeda: 'BRL', pessoa: 'todos' })).toBe(200_000)
  })
  it('ignora meses fora da janela e sem dados dá zero', () => {
    expect(averageMonthlySpend({ transactions: [s({ valorCents: 5_000, data: '2026-01-05' })], mes: '2026-10', moeda: 'BRL', pessoa: 'todos' })).toBe(0)
  })
})

import { payBill } from '../src/domain/bills'

describe('débito × crédito: pagar uma conta', () => {
  it('desconta do total e do crédito, e a sobra continua igual', () => {
    const conta: Bill = {
      id: 'luz', createdAt: 'c', updatedAt: 'u', descricao: 'Luz', valorCents: 35_000, moeda: 'BRL', vencimento: '2026-10-25', diaAncora: 25,
      categoriaId: 'c', pessoa: 'casal', recorrencia: 'unica', status: 'pendente', serieId: 's',
    }
    const entrada = t({ id: 'e', valorCents: 1_000_000 })
    const hoje = '2026-10-20'
    const calc = (bills: Bill[], txs: Transaction[]) => {
      const tot = summarizeTotals({ ...base, transactions: txs })
      const cred = summarizeBillsDue({ bills, ate: endOfMonth('2026-10'), hoje, moeda: 'BRL', rates: perUSD, pessoa: 'todos' })
      return { total: tot.total, credito: cred.total, sobra: tot.total - cred.total }
    }
    const antes = calc([conta], [entrada])
    const r = payBill(conta, { now: 'n', today: hoje, perUSD, newId: () => 'tx-luz' })
    const depois = calc([r.bill], [entrada, r.transaction])
    expect(depois.total).toBe(antes.total - 35_000)
    expect(depois.credito).toBe(antes.credito - 35_000)
    expect(depois.sobra).toBe(antes.sobra)
  })
})

describe('de onde vem o total', () => {
  const txs = [
    t({ id: '1', valorCents: 100_000 }), // recebido
    t({ id: '2', tipo: 'saida', valorCents: 10_000, dizimoDeId: '1' }), // dízimo
    t({ id: '3', tipo: 'saida', valorCents: 30_000 }), // pago
    t({ id: '4', tipo: 'reserva', valorCents: 20_000 }), // guardado
    t({ id: '5', tipo: 'reserva', retirada: true, valorCents: 5_000 }), // retirado
    t({ id: '6', tipo: 'reserva', aporte: true, valorCents: 999_999 }), // já tinha: fora do total
    t({ id: '7', valorCents: 70_000, data: '2026-11-05' }), // entrada futura
  ]
  it('as partes explicam o total, e as entradas futuras ficam de fora', () => {
    const b = breakdownTotals({ ...base, transactions: txs })
    expect(b).toEqual({ recebido: 100_000, dizimo: 10_000, pago: 30_000, guardado: 20_000, retirado: 5_000, entradasFuturas: 70_000 })
    const total = summarizeTotals({ ...base, transactions: txs }).total
    expect(b.recebido - b.dizimo - b.pago - b.guardado + b.retirado).toBe(total)
  })
})

import { calendarGrid } from '../src/domain/dates'
import { billsByDay } from '../src/domain/bills'

describe('calendário de contas', () => {
  it('grade do mês começa no domingo e tem um dia por data', () => {
    const nov = calendarGrid('2026-11') // 1º de novembro de 2026 é domingo
    expect(nov[0]).toBe('2026-11-01')
    expect(nov).toHaveLength(30)
    const out = calendarGrid('2026-10') // 1º de outubro de 2026 é quinta
    expect(out.slice(0, 4)).toEqual([null, null, null, null])
    expect(out[4]).toBe('2026-10-01')
    expect(out).toHaveLength(4 + 31)
  })
  it('fevereiro bissexto tem 29 dias', () => {
    expect(calendarGrid('2028-02').filter(Boolean)).toHaveLength(29)
  })
  it('agrupa as contas pelo dia do vencimento, só do mês e da pessoa', () => {
    const b = (id: string, venc: string, pessoa = 'casal'): Bill => ({
      id, createdAt: 'c', updatedAt: 'u', descricao: id, valorCents: 100, moeda: 'BRL', vencimento: venc, diaAncora: 1, categoriaId: 'c', pessoa,
      recorrencia: 'unica', status: 'pendente', serieId: id,
    })
    const m = billsByDay([b('a', '2026-11-05'), b('b', '2026-11-05', 'gabi'), b('c', '2026-12-05'), b('d', '2026-11-20')], '2026-11', 'todos')
    expect([...m.keys()].sort()).toEqual(['2026-11-05', '2026-11-20'])
    expect(m.get('2026-11-05')).toHaveLength(2)
    expect(billsByDay([b('a', '2026-11-05'), b('b', '2026-11-05', 'gabi')], '2026-11', 'gabi').get('2026-11-05')).toHaveLength(1)
  })
})
