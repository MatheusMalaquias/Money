import type { Currency, ISODate, PerUSD, RatesState } from './types'

/** Valores aproximados, só para o app funcionar antes da primeira atualização (date = null avisa o usuário). */
export const DEFAULT_RATES: RatesState = {
  perUSD: { USD: 1, BRL: 5, EUR: 0.9 },
  date: null,
  manual: [],
}

/** Aplica uma cotação buscada sem desfazer o que o usuário fixou à mão. */
export function mergeFetched(current: RatesState, fetched: PerUSD, date: ISODate): RatesState {
  const perUSD = { ...current.perUSD }
  for (const c of Object.keys(fetched) as Currency[]) {
    if (!current.manual.includes(c)) perUSD[c] = fetched[c]
  }
  perUSD.USD = 1
  return { perUSD, date, manual: current.manual }
}

/** Fixa (ou libera, com value = null) a cotação de uma moeda. */
export function setManual(current: RatesState, currency: Currency, value: number | null): RatesState {
  if (currency === 'USD') return current
  const manual = current.manual.filter((c) => c !== currency)
  if (value === null) return { ...current, manual }
  return { ...current, perUSD: { ...current.perUSD, [currency]: value }, manual: [...manual, currency] }
}

/** Quanto vale 1 unidade de `from` em `to` (para mostrar "1 US$ = R$ 5,05"). */
export const pairRate = (from: Currency, to: Currency, perUSD: PerUSD) => perUSD[to] / perUSD[from]

/** Cotação desatualizada: nunca buscada ou com mais de 3 dias (cobre fim de semana e feriado). */
export function isStale(rates: RatesState, today: ISODate, diff: (a: ISODate, b: ISODate) => number): boolean {
  return rates.date === null || diff(rates.date, today) > 3
}
