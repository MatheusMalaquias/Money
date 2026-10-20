import type { Currency, ISODate, PerUSD } from '../domain/types'

const URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL,EUR'

export interface FetchedRates {
  perUSD: PerUSD
  date: ISODate
}

/**
 * Cotação de referência do Banco Central Europeu via Frankfurter (grátis, sem chave, atualizada em dias úteis).
 * Não é a cotação do seu banco/corretora (que inclui spread e IOF): por isso cada moeda pode ser fixada à mão.
 */
export async function fetchRates(signal?: AbortSignal): Promise<FetchedRates> {
  const res = await fetch(URL, { signal })
  if (!res.ok) throw new Error(`Câmbio indisponível (${res.status})`)
  const json = (await res.json()) as { date: string; rates: Partial<Record<Currency, number>> }
  const { BRL, EUR } = json.rates
  if (!BRL || !EUR || !json.date) throw new Error('Resposta de câmbio inválida')
  return { perUSD: { USD: 1, BRL, EUR }, date: json.date }
}
