import { convert } from './money'
import { monthKey } from './dates'
import type { Bill, Currency, PerUSD, PersonId, Transaction } from './types'

export interface MonthSummary {
  entradas: number
  saidas: number
  saldo: number
  faltaPagar: number
  /** Parte das saídas que é dízimo. */
  dizimo: number
  porCategoria: { categoriaId: string; total: number }[]
  /** Valores originais, sem conversão: o que realmente entrou/saiu em cada moeda. */
  porMoeda: Record<Currency, { entradas: number; saidas: number; faltaPagar: number }>
}

interface Input {
  mes: string // "YYYY-MM"
  transactions: Transaction[]
  bills: Bill[]
  /** Cotação atual: usada para as contas a pagar, que ainda não aconteceram. */
  rates: PerUSD
  moeda: Currency
  /** 'todos' ou o id de uma pessoa. */
  pessoa: PersonId | 'todos'
}

const empty = () => ({ entradas: 0, saidas: 0, faltaPagar: 0 })

/**
 * Totais do mês em uma moeda de exibição.
 * Lançamentos usam o câmbio do dia em que foram feitos; contas pendentes usam o câmbio atual.
 * "Falta pagar" = contas pendentes com vencimento no mês (as já pagas viram lançamento de saída).
 */
export function summarizeMonth({ mes, transactions, bills, rates, moeda, pessoa }: Input): MonthSummary {
  const match = (p: PersonId) => pessoa === 'todos' || p === pessoa
  const porMoeda: MonthSummary['porMoeda'] = { BRL: empty(), USD: empty(), EUR: empty() }
  const cats = new Map<string, number>()
  let entradas = 0
  let saidas = 0
  let faltaPagar = 0
  let dizimo = 0

  for (const t of transactions) {
    if (monthKey(t.data) !== mes || !match(t.pessoa)) continue
    const v = convert(t.valorCents, t.moeda, moeda, t.cambio)
    if (t.tipo === 'entrada') {
      entradas += v
      porMoeda[t.moeda].entradas += t.valorCents
    } else {
      saidas += v
      if (t.dizimoDeId) dizimo += v
      porMoeda[t.moeda].saidas += t.valorCents
      cats.set(t.categoriaId, (cats.get(t.categoriaId) ?? 0) + v)
    }
  }
  for (const b of bills) {
    if (b.status !== 'pendente' || monthKey(b.vencimento) !== mes || !match(b.pessoa)) continue
    faltaPagar += convert(b.valorCents, b.moeda, moeda, rates)
    porMoeda[b.moeda].faltaPagar += b.valorCents
  }

  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
    faltaPagar,
    dizimo,
    porCategoria: [...cats].map(([categoriaId, total]) => ({ categoriaId, total })).sort((a, b) => b.total - a.total),
    porMoeda,
  }
}
