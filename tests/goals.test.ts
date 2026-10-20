import { describe, expect, it } from 'vitest'
import { monthsUntil, planGoal } from '../src/domain/goals'
import type { Goal } from '../src/domain/types'

const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g', createdAt: 'x', updatedAt: 'x', nome: 'Mudança', alvoCents: 1_200_000, atualCents: 0, moeda: 'EUR',
  prazo: '2027-10-20', pessoa: 'casal', ...o,
})

describe('metas', () => {
  it('conta meses completos até o prazo', () => {
    expect(monthsUntil('2026-10-20', '2027-10-20')).toBe(12)
    expect(monthsUntil('2026-10-20', '2027-10-19')).toBe(11)
    expect(monthsUntil('2026-10-20', '2026-10-25')).toBe(0)
    expect(monthsUntil('2026-12-15', '2027-02-15')).toBe(2)
  })
  it('divide o que falta pelos meses restantes', () => {
    const p = planGoal(goal(), '2026-10-20')
    expect(p).toMatchObject({ status: 'andamento', meses: 12, restanteCents: 1_200_000, porMesCents: 100_000, progresso: 0 })
  })
  it('desconta o que já foi guardado', () => {
    const p = planGoal(goal({ atualCents: 300_000 }), '2026-10-20')
    expect(p.restanteCents).toBe(900_000)
    expect(p.porMesCents).toBe(75_000)
    expect(p.progresso).toBe(0.25)
  })
  it('arredonda para cima, para nunca chegar abaixo da meta', () => {
    expect(planGoal(goal({ alvoCents: 100_000, prazo: '2027-08-20' }), '2026-10-20').porMesCents).toBe(10_000) // 10 meses
    expect(planGoal(goal({ alvoCents: 100_001, prazo: '2027-08-20' }), '2026-10-20').porMesCents).toBe(10_001)
  })
  it('no último mês, guarda tudo de uma vez', () => {
    const p = planGoal(goal({ prazo: '2026-10-25' }), '2026-10-20')
    expect(p.meses).toBe(0)
    expect(p.porMesCents).toBe(1_200_000)
  })
  it('meta concluída, atrasada e sem prazo', () => {
    expect(planGoal(goal({ atualCents: 1_300_000 }), '2026-10-20')).toMatchObject({ status: 'concluida', restanteCents: 0, porMesCents: 0, progresso: 1 })
    expect(planGoal(goal({ prazo: '2026-09-01' }), '2026-10-20').status).toBe('atrasada')
    expect(planGoal(goal({ prazo: undefined }), '2026-10-20').porMesCents).toBeNull()
  })
})
