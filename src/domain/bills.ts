import { diffDays } from './dates'
import { nextDue } from './recurrence'
import type { Bill, ISODate, PerUSD, Transaction } from './types'

export type BillState = 'paga' | 'vencida' | 'semana' | 'futura'

/** Pendente: vencida (antes de hoje), "semana" (hoje até 7 dias) ou futura. */
export function billState(bill: Bill, today: ISODate): BillState {
  if (bill.status === 'paga') return 'paga'
  const d = diffDays(today, bill.vencimento)
  if (d < 0) return 'vencida'
  return d <= 7 ? 'semana' : 'futura'
}

/** Pendentes por vencimento crescente (as vencidas ficam no topo); pagas depois, da mais recente para a mais antiga. */
export function sortBills(bills: Bill[]): Bill[] {
  const rank = (b: Bill) => (b.status === 'pendente' ? 0 : 1)
  return [...bills].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return a.status === 'pendente'
      ? a.vencimento.localeCompare(b.vencimento)
      : (b.pagaEm ?? '').localeCompare(a.pagaEm ?? '')
  })
}

interface PayDeps {
  now: string
  today: ISODate
  perUSD: PerUSD
  newId: () => string
}

export interface PayResult {
  bill: Bill
  transaction: Transaction
  next?: Bill
}

/**
 * Marca como paga: gera o lançamento de saída (para o gasto entrar no saldo e no gráfico)
 * e, se recorrente, a próxima ocorrência pendente.
 */
export function payBill(bill: Bill, { now, today, perUSD, newId }: PayDeps): PayResult {
  if (bill.status === 'paga') throw new Error('Conta já está paga')
  const transaction: Transaction = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    tipo: 'saida',
    valorCents: bill.valorCents,
    moeda: bill.moeda,
    data: today,
    categoriaId: bill.categoriaId,
    descricao: bill.descricao,
    pessoa: bill.pessoa,
    contaId: bill.id,
    cambio: perUSD,
  }
  const due = nextDue(bill.vencimento, bill.recorrencia, bill.diaAncora)
  const next: Bill | undefined = due
    ? { ...bill, id: newId(), createdAt: now, updatedAt: now, vencimento: due, status: 'pendente', pagaEm: undefined, transacaoId: undefined, proximaId: undefined }
    : undefined
  const paid: Bill = { ...bill, status: 'paga', pagaEm: today, transacaoId: transaction.id, proximaId: next?.id, updatedAt: now }
  return { bill: paid, transaction, next }
}

export interface UnpayResult {
  bill: Bill
  removeTransactionId?: string
  /** Só é removida se ainda estiver pendente: se já foi paga, vira histórico e fica. */
  removeBillId?: string
}

export function unpayBill(bill: Bill, all: Bill[], now: string): UnpayResult {
  const next = bill.proximaId ? all.find((b) => b.id === bill.proximaId) : undefined
  return {
    bill: { ...bill, status: 'pendente', pagaEm: undefined, transacaoId: undefined, proximaId: undefined, updatedAt: now },
    removeTransactionId: bill.transacaoId,
    removeBillId: next && next.status === 'pendente' ? next.id : undefined,
  }
}
