import type { Transaction } from './types'

export const DEFAULT_TITHE_BPS = 1000 // 10%

/** Dízimo de um valor em centavos (arredonda para o centavo mais próximo). */
export const titheAmount = (cents: number, bps: number): number => Math.round((cents * bps) / 10_000)

interface Deps {
  now: string
  newId: () => string
  categoriaId: string
  bps: number
  /** Dízimo já existente desta entrada: é atualizado em vez de duplicado. */
  existing?: Transaction
}

/** Saída de dízimo ligada a uma entrada: mesma data, pessoa, moeda e câmbio da entrada. */
export function buildTithe(income: Transaction, { now, newId, categoriaId, bps, existing }: Deps): Transaction {
  return {
    id: existing?.id ?? newId(),
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
