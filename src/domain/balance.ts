import { addMonths } from './dates'
import { convert } from './money'
import type { Bill, Currency, ISODate, PerUSD, PersonId, Transaction } from './types'

export interface Totals {
  /** O que há para usar agora: entradas − saídas (já sem o dízimo) − o que foi para a reserva + o que voltou dela. */
  total: number
  /** Dinheiro que está na reserva. */
  reserva: number
  /** Tudo junto: total + reserva. */
  junto: number
  /** Total de cada pessoa ('casal' = valores compartilhados). */
  porPessoa: { pessoa: PersonId; total: number }[]
}

/**
 * "Quanto temos": soma acumulada de todas as entradas menos todas as saídas até `ate` (inclusive).
 * O dízimo já é uma saída, então o total é depois dele. A reserva é um cofre separado:
 *  - guardar: sai do total e entra na reserva;
 *  - tirar: sai da reserva e volta ao total;
 *  - "já tinha": saldo que a reserva já tinha antes do app, só soma na reserva (não veio do total).
 * Cada lançamento usa o câmbio do dia em que foi feito.
 */
export function summarizeTotals({ transactions, ate, moeda, pessoa }: { transactions: Transaction[]; ate: ISODate; moeda: Currency; pessoa: PersonId | 'todos' }): Totals {
  let total = 0
  let reserva = 0
  const por = new Map<PersonId, number>()
  const move = (p: PersonId, d: number) => {
    total += d
    por.set(p, (por.get(p) ?? 0) + d)
  }
  for (const t of transactions) {
    if (t.data > ate || (pessoa !== 'todos' && t.pessoa !== pessoa)) continue
    const v = convert(t.valorCents, t.moeda, moeda, t.cambio)
    if (t.tipo === 'reserva') {
      if (t.aporte) reserva += v
      else if (t.retirada) {
        reserva -= v
        move(t.pessoa, v)
      } else {
        reserva += v
        move(t.pessoa, -v)
      }
    } else move(t.pessoa, t.tipo === 'entrada' ? v : -v)
  }
  return { total, reserva, junto: total + reserva, porPessoa: [...por].map(([p, t]) => ({ pessoa: p, total: t })) }
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

export interface Breakdown {
  /** Entradas até a data. */
  recebido: number
  /** Dízimo já descontado. */
  dizimo: number
  /** Contas pagas e gastos (sem o dízimo). */
  pago: number
  /** Enviado para a reserva (sai do total). */
  guardado: number
  /** Devolvido da reserva (volta ao total). */
  retirado: number
  /** Entradas com data depois da data escolhida: ainda não contam no total. */
  entradasFuturas: number
}

/** De onde vem o total: recebido − dízimo − pago − guardado + retirado. Mesma regra de `summarizeTotals`. */
export function breakdownTotals({ transactions, ate, moeda, pessoa }: { transactions: Transaction[]; ate: ISODate; moeda: Currency; pessoa: PersonId | 'todos' }): Breakdown {
  const b: Breakdown = { recebido: 0, dizimo: 0, pago: 0, guardado: 0, retirado: 0, entradasFuturas: 0 }
  for (const t of transactions) {
    if (pessoa !== 'todos' && t.pessoa !== pessoa) continue
    const v = convert(t.valorCents, t.moeda, moeda, t.cambio)
    if (t.data > ate) {
      if (t.tipo === 'entrada') b.entradasFuturas += v
      continue
    }
    if (t.tipo === 'entrada') b.recebido += v
    else if (t.tipo === 'saida') b[t.dizimoDeId ? 'dizimo' : 'pago'] += v
    else if (t.retirada) b.retirado += v
    else if (!t.aporte) b.guardado += v
  }
  return b
}
