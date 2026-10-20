import type { Goal, ISODate } from './types'

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
