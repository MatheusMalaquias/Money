import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = (): ISODate => toISO(new Date())

/** "2026-10-20" → "20/10/2026". */
export const toBR = (iso: ISODate): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export const monthKey = (iso: ISODate): string => iso.slice(0, 7)
export const daysInMonth = (year: number, month1: number): number => new Date(year, month1, 0).getDate()

/** Soma meses a uma chave "YYYY-MM". */
export function addMonths(key: string, n: number): string {
  const total = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Monta uma data limitando o dia ao último do mês (31 em fevereiro vira 28/29). */
export function clampedDate(key: string, day: number): ISODate {
  const dim = daysInMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7)))
  return `${key}-${pad(Math.min(day, dim))}`
}

/** Diferença em dias inteiros (b − a). Usa UTC para o horário de verão não gerar 23h/25h. */
export function diffDays(a: ISODate, b: ISODate): number {
  const t = (s: ISODate) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((t(b) - t(a)) / 86_400_000)
}

export function monthLabel(key: string): string {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1))
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Soma dias a uma data ISO, sem depender do fuso (UTC evita o salto do horário de verão). */
export function addDays(iso: ISODate, n: number): ISODate {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
