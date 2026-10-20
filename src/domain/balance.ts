import { addMonths } from './dates'
import { convert } from './money'
import type { Bill, Currency, ISODate, PerUSD, PersonId, Transaction } from './types'

export interface Totals {
  /** Tudo que entrou menos tudo que saiu (já com o dízimo descontado), acumulado até a data. */
  total: number
  /** Parte do total separada na reserva. */
  reserva: number
  /** O que sobra para usar: total − reserva. */
  disponivel: number
  /** Total de cada pessoa ('casal' = valores compartilhados). */
  porPessoa: { pessoa: PersonId; total: number }[]
}

/**
 * "Quanto temos": soma acumulada de todas as entradas menos todas as saídas até `ate` (inclusive).
 * O dízimo já é uma saída, então o total é depois dele. A reserva não é gasto: só separa uma parte do total.
 * Cada lançamento usa o câmbio do dia em que foi feito.
 */
export function summarizeTotals({ transactions, ate, moeda, pessoa }: { transactions: Transaction[]; ate: ISODate; moeda: Currency; pessoa: PersonId | 'todos' }): Totals {
  let total = 0
  let reserva = 0
  const por = new Map<PersonId, number>()
  for (const t of transactions) {
    if (t.data > ate || (pessoa !== 'todos' && t.pessoa !== pessoa)) continue
    const v = convert(t.valorCents, t.moeda, moeda, t.cambio)
    if (t.tipo === 'reserva') {
      reserva += t.retirada ? -v : v
      if (t.aporte) {
        // dinheiro novo na reserva: entra no total também (senão a reserva passaria do que vocês têm)
        total += v
        por.set(t.pessoa, (por.get(t.pessoa) ?? 0) + v)
      }
      continue
    }
    const delta = t.tipo === 'entrada' ? v : -v
    total += delta
    por.set(t.pessoa, (por.get(t.pessoa) ?? 0) + delta)
  }
  return { total, reserva, disponivel: total - reserva, porPessoa: [...por].map(([p, t]) => ({ pessoa: p, total: t })) }
}

/** Último dia possível do mês "YYYY-MM" para comparar como texto (dia 31 serve: datas reais nunca passam do fim do mês). */
export const endOfMonth = (mes: string): ISODate => `${mes}-31`

export interface BillsDue {
  /** Contas pendentes com vencimento até a data, na moeda de exibição (câmbio atual). */
  total: number
  count: number
  vencidas: { total: number; count: number }
}

/** O que ainda falta pagar em contas registradas: pendentes que vencem até `ate`, incluindo as já vencidas. */
export function summarizeBillsDue({ bills, ate, hoje, moeda, rates, pessoa }: { bills: Bill[]; ate: ISODate; hoje: ISODate; moeda: Currency; rates: PerUSD; pessoa: PersonId | 'todos' }): BillsDue {
  const out: BillsDue = { total: 0, count: 0, vencidas: { total: 0, count: 0 } }
  for (const b of bills) {
    if (b.status !== 'pendente' || b.vencimento > ate || (pessoa !== 'todos' && b.pessoa !== pessoa)) continue
    const v = convert(b.valorCents, b.moeda, moeda, rates)
    out.total += v
    out.count += 1
    if (b.vencimento < hoje) {
      out.vencidas.total += v
      out.vencidas.count += 1
    }
  }
  return out
}

/**
 * Gasto médio por mês nos últimos 3 meses (até o mês escolhido), sem contar o dízimo nem a reserva.
 * Só conta os meses em que houve gasto, para quem começou há pouco não ter a média puxada para baixo.
 */
export function averageMonthlySpend({ transactions, mes, moeda, pessoa, months = 3 }: { transactions: Transaction[]; mes: string; moeda: Currency; pessoa: PersonId | 'todos'; months?: number }): number {
  const window = new Set(Array.from({ length: months }, (_, i) => addMonths(mes, -i)))
  const perMonth = new Map<string, number>()
  for (const t of transactions) {
    const m = t.data.slice(0, 7)
    if (t.tipo !== 'saida' || t.dizimoDeId || !window.has(m) || (pessoa !== 'todos' && t.pessoa !== pessoa)) continue
    perMonth.set(m, (perMonth.get(m) ?? 0) + convert(t.valorCents, t.moeda, moeda, t.cambio))
  }
  if (perMonth.size === 0) return 0
  return Math.round([...perMonth.values()].reduce((a, b) => a + b, 0) / perMonth.size)
}
