import type { Currency, PerUSD } from './types'

/** Formata centavos como moeda pt-BR: "R$ 1.234,56", "US$ 1.234,56", "€ 1.234,56". */
export function formatMoney(cents: number, currency: Currency): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100)
}

/**
 * Lê o que a pessoa digitou e devolve centavos (inteiro), ou null se inválido.
 * Aceita "1.234,56", "1234,56", "1234.56", "1234". Um ponto seguido de exatamente 3 dígitos
 * é separador de milhar ("1.234"); com 1–2 dígitos é decimal ("12.5").
 */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/\s/g, '').replace(/^(R\$|US\$|\$|€)/, '')
  if (!s || !/^[\d.,]+$/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let intPart: string
  let frac = ''
  if (lastComma >= 0) {
    intPart = s.slice(0, lastComma).replace(/[.,]/g, '')
    frac = s.slice(lastComma + 1)
  } else if (lastDot >= 0 && s.length - lastDot - 1 !== 3) {
    intPart = s.slice(0, lastDot).replace(/[.,]/g, '')
    frac = s.slice(lastDot + 1)
  } else {
    intPart = s.replace(/[.,]/g, '')
  }
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null
  if (!intPart && !frac) return null
  return Number(intPart || '0') * 100 + Number(frac.padEnd(2, '0') || '0')
}

/** Centavos → texto editável "1234,56" (para preencher o campo ao editar). */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** Converte centavos entre moedas usando a tabela "unidades por 1 USD". Arredonda uma única vez, no fim. */
export function convert(cents: number, from: Currency, to: Currency, perUSD: PerUSD): number {
  if (from === to) return cents
  return Math.round((cents * perUSD[to]) / perUSD[from])
}
