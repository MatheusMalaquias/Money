import { diffDays, toBR } from './dates'
import { nextDue, occurrences } from './recurrence'
import type { Bill, ISODate, PerUSD, PersonId, Transaction } from './types'

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
  /** Todas as contas: evita criar a próxima ocorrência se ela já existe (série com fim é criada de uma vez). */
  series?: Bill[]
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
export function payBill(bill: Bill, { now, today, perUSD, newId, series = [] }: PayDeps): PayResult {
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
  const raw = nextDue(bill.vencimento, bill.recorrencia, bill.diaAncora)
  const exists = raw !== null && series.some((b) => b.serieId === bill.serieId && b.vencimento === raw)
  const due = raw !== null && (!bill.fim || raw <= bill.fim) && !exists ? raw : null
  const next: Bill | undefined = due    ? { ...bill, id: newId(), createdAt: now, updatedAt: now, vencimento: due, status: 'pendente', pagaEm: undefined, transacaoId: undefined, proximaId: undefined }
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

/**
 * Uma conta com "repetir até" gera todas as parcelas de uma vez (para cada mês mostrar o que falta pagar).
 * Chamada ao criar e ao editar: acrescenta as que faltam e apaga as pendentes que ficaram depois do novo fim.
 */
export function reconcileSeries(bill: Bill, all: Bill[], { now, newId }: { now: string; newId: () => string }): { add: Bill[]; removeIds: string[] } {
  if (bill.recorrencia === 'unica' || !bill.fim) return { add: [], removeIds: [] }
  const others = all.filter((b) => b.serieId === bill.serieId && b.id !== bill.id)
  const have = new Set([bill.vencimento, ...others.map((b) => b.vencimento)])
  const add = occurrences(bill.vencimento, bill.recorrencia, bill.diaAncora, bill.fim)
    .filter((d) => !have.has(d))
    .map((d): Bill => ({ ...bill, id: newId(), createdAt: now, updatedAt: now, vencimento: d, status: 'pendente', pagaEm: undefined, transacaoId: undefined, proximaId: undefined }))
  const removeIds = others.filter((b) => b.status === 'pendente' && b.vencimento > bill.fim!).map((b) => b.id)
  return { add, removeIds }
}

/**
 * Registros a gravar ao cadastrar uma conta nova. Se já foi paga (`paidOn`), nasce paga:
 * cria também o lançamento de saída (para descontar do total) e a próxima ocorrência, como ao marcar como paga.
 */
export function planNewBill(bill: Bill, all: Bill[], { paidOn, now, perUSD, newId }: { paidOn?: ISODate; now: string; perUSD: PerUSD; newId: () => string }): { bills: Bill[]; transaction?: Transaction } {
  let bills = [bill, ...reconcileSeries(bill, all, { now, newId }).add]
  if (!paidOn) return { bills }
  const r = payBill(bill, { now, today: paidOn, perUSD, newId, series: [...all, ...bills] })
  bills = bills.map((b) => (b.id === bill.id ? r.bill : b))
  if (r.next) bills.push(r.next)
  return { bills, transaction: r.transaction }
}

/** Frase do vencimento ("Vencida há 3 dias", "Vence em 2 dias") e o quão urgente é. */
export function dueLabel(b: Bill, today: ISODate): { text: string; urgency: 'paga' | 'atrasada' | 'urgente' | 'normal' } {
  if (b.status === 'paga') return { text: `Paga em ${toBR(b.pagaEm!)}`, urgency: 'paga' }
  const d = diffDays(today, b.vencimento)
  if (d < 0) return { text: `Vencida há ${-d} ${-d === 1 ? 'dia' : 'dias'}`, urgency: 'atrasada' }
  if (d === 0) return { text: 'Vence hoje', urgency: 'urgente' }
  if (d <= 7) return { text: `Vence em ${d} ${d === 1 ? 'dia' : 'dias'}`, urgency: 'urgente' }
  return { text: `Vence ${toBR(b.vencimento)}`, urgency: 'normal' }
}

/** Contas de um mês agrupadas pelo dia do vencimento (para o calendário). */
export function billsByDay(bills: Bill[], mes: string, pessoa: PersonId | 'todos'): Map<ISODate, Bill[]> {
  const out = new Map<ISODate, Bill[]>()
  for (const b of bills) {
    if (b.vencimento.slice(0, 7) !== mes || (pessoa !== 'todos' && b.pessoa !== pessoa)) continue
    out.set(b.vencimento, [...(out.get(b.vencimento) ?? []), b])
  }
  return out
}
