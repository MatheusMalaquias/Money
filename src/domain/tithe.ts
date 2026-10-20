import { convert } from './money'
import type { Currency, PersonId, Transaction } from './types'

export const DEFAULT_TITHE_BPS = 1000 // 10%

/**
 * Toda entrada entra no dízimo por padrão (inclusive as antigas, sem o campo). Só sai com "dizimo: false",
 * a exceção marcada à mão, como um reembolso.
 */
export const entersTithe = (t: Transaction): boolean => t.tipo === 'entrada' && !t.dizimoDeId && t.dizimo !== false

/** Dízimo de um valor em centavos (arredonda para o centavo mais próximo). */
export const titheAmount = (cents: number, bps: number): number => Math.round((cents * bps) / 10_000)

interface Deps {
  now: string
  categoriaId: string
  bps: number
  /** Dízimo já existente desta entrada: é atualizado em vez de duplicado. */
  existing?: Transaction
}

/** Saída de dízimo ligada a uma entrada: mesma data, pessoa, moeda e câmbio da entrada. */
export function buildTithe(income: Transaction, { now, categoriaId, bps, existing }: Deps): Transaction {
  return {
    // id fixo por entrada: gravar de novo sobrescreve em vez de duplicar, mesmo se o cálculo rodar duas vezes
    id: existing?.id ?? `dz-${income.id}`,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    tipo: 'saida',
    valorCents: titheAmount(income.valorCents, bps),
    moeda: income.moeda,
    data: income.data,
    categoriaId,
    descricao: `Dízimo${income.descricao ? ` · ${income.descricao}` : ''}`,
    pessoa: income.pessoa,
    dizimoDeId: income.id,
    cambio: income.cambio,
  }
}

export interface TitheSummary {
  /** Dízimo do mês, na moeda de exibição. */
  total: number
  /** Entradas do mês sobre as quais o dízimo foi calculado. */
  base: number
  /** O que sobra dessas entradas depois do dízimo (base − dízimo). */
  liquido: number
  /** Entradas do mês marcadas sem dízimo: quanto seria o dízimo se fossem incluídas. */
  semDizimo: { base: number; seria: number }
  /** Dízimo do ano inteiro do mês escolhido. */
  ano: number
  porPessoa: { pessoa: PersonId; total: number }[]
  /** Valores originais, sem conversão. */
  porMoeda: Record<Currency, number>
  itens: Transaction[]
}

/** Resumo do dízimo de um mês, do ano e por pessoa. Usa o câmbio guardado em cada lançamento. */
export function summarizeTithe({ mes, transactions, moeda, pessoa, bps = DEFAULT_TITHE_BPS }: { mes: string; transactions: Transaction[]; moeda: Currency; pessoa: PersonId | 'todos'; bps?: number }): TitheSummary {
  const match = (p: PersonId) => pessoa === 'todos' || p === pessoa
  const conv = (t: Transaction) => convert(t.valorCents, t.moeda, moeda, t.cambio)
  const itens = transactions.filter((t) => t.dizimoDeId && t.data.slice(0, 7) === mes && match(t.pessoa)).sort((a, b) => b.data.localeCompare(a.data))
  const porPessoa = new Map<PersonId, number>()
  const porMoeda: Record<Currency, number> = { BRL: 0, USD: 0, EUR: 0 }
  let total = 0
  for (const t of itens) {
    total += conv(t)
    porMoeda[t.moeda] += t.valorCents
    porPessoa.set(t.pessoa, (porPessoa.get(t.pessoa) ?? 0) + conv(t))
  }
  const base = transactions.filter((t) => entersTithe(t) && t.data.slice(0, 7) === mes && match(t.pessoa)).reduce((s, t) => s + conv(t), 0)
  const semBase = transactions.filter((t) => t.tipo === 'entrada' && t.dizimo === false && t.data.slice(0, 7) === mes && match(t.pessoa)).reduce((s, t) => s + conv(t), 0)
  const semSeria = transactions.filter((t) => t.tipo === 'entrada' && t.dizimo === false && t.data.slice(0, 7) === mes && match(t.pessoa)).reduce((s, t) => s + convert(titheAmount(t.valorCents, bps), t.moeda, moeda, t.cambio), 0)
  const ano = transactions.filter((t) => t.dizimoDeId && t.data.slice(0, 4) === mes.slice(0, 4) && match(t.pessoa)).reduce((s, t) => s + conv(t), 0)
  return { total, base, liquido: base - total, semDizimo: { base: semBase, seria: semSeria }, ano, porPessoa: [...porPessoa].map(([p, t]) => ({ pessoa: p, total: t })), porMoeda, itens }
}
