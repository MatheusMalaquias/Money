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
