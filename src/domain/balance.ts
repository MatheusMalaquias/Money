import { convert } from './money'
import type { Currency, ISODate, PersonId, Transaction } from './types'

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
