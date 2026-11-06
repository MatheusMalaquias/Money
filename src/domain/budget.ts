import { convert } from './money'
import type { Bill, Budget, Currency, PerUSD, Transaction } from './types'

export type BudgetLevel = 'ok' | 'perto' | 'passa' | 'estourou'

export interface BudgetRow {
  categoriaId: string
  limite: number
  /** Já gasto no mês (pagamentos e saídas, sem o dízimo). */
  gasto: number
  /** Contas ainda pendentes com vencimento no mês. */
  previsto: number
  /** limite − gasto − previsto (negativo = passa do limite). */
  restante: number
  nivel: BudgetLevel
}

export interface BudgetSummary {
  rows: BudgetRow[]
  /** Categorias com gasto no mês mas sem limite definido. */
  semLimite: { categoriaId: string; total: number }[]
  limite: number
  gasto: number
  previsto: number
}

const NEAR = 0.8

/**
 * Limite × gasto de cada categoria no mês.
 * Estourou: o gasto já passou do limite. Passa: com as contas pendentes vai passar. Perto: gasto + contas ≥ 80%.
 */
export function summarizeBudget({ mes, budgets, transactions, bills, rates, moeda }: { mes: string; budgets: Budget[]; transactions: Transaction[]; bills: Bill[]; rates: PerUSD; moeda: Currency }): BudgetSummary {
  const spent = new Map<string, number>()
  for (const t of transactions) {
    if (t.tipo !== 'saida' || t.dizimoDeId || t.data.slice(0, 7) !== mes) continue
    spent.set(t.categoriaId, (spent.get(t.categoriaId) ?? 0) + convert(t.valorCents, t.moeda, moeda, t.cambio))
  }
  const pending = new Map<string, number>()
  for (const b of bills) {
    if (b.status !== 'pendente' || b.vencimento.slice(0, 7) !== mes) continue
    pending.set(b.categoriaId, (pending.get(b.categoriaId) ?? 0) + convert(b.valorCents, b.moeda, moeda, rates))
  }
  const rows: BudgetRow[] = budgets
    .filter((b) => b.valorCents > 0)
    .map((b) => {
      const limite = convert(b.valorCents, b.moeda, moeda, rates)
      const gasto = spent.get(b.categoriaId) ?? 0
      const previsto = pending.get(b.categoriaId) ?? 0
      const nivel: BudgetLevel = gasto > limite ? 'estourou' : gasto + previsto > limite ? 'passa' : gasto + previsto >= limite * NEAR ? 'perto' : 'ok'
      return { categoriaId: b.categoriaId, limite, gasto, previsto, restante: limite - gasto - previsto, nivel }
    })
    .sort((a, b) => (b.gasto + b.previsto) / b.limite - (a.gasto + a.previsto) / a.limite)
  const limited = new Set(rows.map((r) => r.categoriaId))
  return {
    rows,
    semLimite: [...spent].filter(([id]) => !limited.has(id)).map(([categoriaId, total]) => ({ categoriaId, total })).sort((a, b) => b.total - a.total),
    limite: rows.reduce((s, r) => s + r.limite, 0),
    gasto: rows.reduce((s, r) => s + r.gasto, 0),
    previsto: rows.reduce((s, r) => s + r.previsto, 0),
  }
}
