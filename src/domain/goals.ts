import { convert } from './money'
import type { Currency, Goal, ISODate, PerUSD } from './types'

/**
 * Meses que ainda cabem até o prazo, contando só meses completos:
 * de 20/10/2026 a 20/10/2027 são 12; a 19/10/2027 seriam 11 (ainda falta um dia para completar o 12º).
 */
export function monthsUntil(today: ISODate, deadline: ISODate): number {
  const idx = (d: ISODate) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
  const m = idx(deadline) - idx(today)
  return m - (Number(deadline.slice(8, 10)) < Number(today.slice(8, 10)) ? 1 : 0)
}

export type GoalStatus = 'concluida' | 'atrasada' | 'andamento'

export interface GoalPlan {
  status: GoalStatus
  restanteCents: number
  /** Meses completos até o prazo (pode ser 0 no último mês). */
  meses: number
  /** Quanto guardar por mês para chegar no prazo, arredondado para cima (centavos); null se a meta não tem prazo. */
  porMesCents: number | null
  /** 0 a 1. */
  progresso: number
}

/** Calcula o plano de uma meta: o que falta e quanto guardar por mês até o prazo. */
export function planGoal(goal: Goal, today: ISODate): GoalPlan {
  const restanteCents = Math.max(0, goal.alvoCents - goal.atualCents)
  const progresso = goal.alvoCents > 0 ? Math.min(1, goal.atualCents / goal.alvoCents) : 0
  if (restanteCents === 0) return { status: 'concluida', restanteCents, meses: 0, porMesCents: 0, progresso: 1 }
  if (!goal.prazo) return { status: 'andamento', restanteCents, meses: 0, porMesCents: null, progresso }
  if (goal.prazo < today) return { status: 'atrasada', restanteCents, meses: 0, porMesCents: restanteCents, progresso }
  const meses = monthsUntil(today, goal.prazo)
  // no último mês (meses = 0) ainda cabe um depósito: divide por pelo menos 1
  const porMesCents = Math.ceil(restanteCents / Math.max(1, meses))
  return { status: 'andamento', restanteCents, meses, porMesCents, progresso }
}

export interface MonthlyNeed {
  /** Quanto guardar por mês, somando todas as metas em andamento, na moeda de exibição. */
  total: number
  /** Metas em andamento com prazo. */
  count: number
  /** Metas cujo prazo já passou e ainda faltam valores. */
  atrasadas: number
  concluidas: number
}

/** Quanto precisamos guardar por mês para cumprir todas as metas no prazo. */
export function monthlyNeed(goals: Goal[], today: ISODate, moeda: Currency, rates: PerUSD): MonthlyNeed {
  const out: MonthlyNeed = { total: 0, count: 0, atrasadas: 0, concluidas: 0 }
  for (const g of goals) {
    const p = planGoal(g, today)
    if (p.status === 'concluida') out.concluidas += 1
    else if (p.status === 'atrasada') out.atrasadas += 1
    else if (p.porMesCents !== null) {
      out.total += convert(p.porMesCents, g.moeda, moeda, rates)
      out.count += 1
    }
  }
  return out
}
