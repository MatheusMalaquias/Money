import { addMonths, clampedDate, monthKey } from './dates'
import type { ISODate, Recurrence } from './types'

/**
 * Próximo vencimento de uma conta recorrente, ou null se for única.
 * Parte do dia âncora e não do vencimento atual: uma conta do dia 31 vai 31/01 → 28/02 → 31/03
 * (e não 28/03). O mesmo vale para 29/02 em anos não bissextos.
 */
export function nextDue(vencimento: ISODate, recorrencia: Recurrence, diaAncora: number): ISODate | null {
  if (recorrencia === 'unica') return null
  const step = recorrencia === 'mensal' ? 1 : 12
  return clampedDate(addMonths(monthKey(vencimento), step), diaAncora)
}

const MAX_OCCURRENCES = 240 // 20 anos de contas mensais: trava contra datas digitadas errado

/** Vencimentos de `inicio` até `fim` (inclusive). Sem recorrência, só o próprio `inicio`. */
export function occurrences(inicio: ISODate, recorrencia: Recurrence, diaAncora: number, fim: ISODate): ISODate[] {
  const dates = [inicio]
  let cur = inicio
  while (dates.length < MAX_OCCURRENCES) {
    const n = nextDue(cur, recorrencia, diaAncora)
    if (!n || n > fim) break
    dates.push(n)
    cur = n
  }
  return dates
}
