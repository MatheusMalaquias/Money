import { addMonths, clampedDate } from './dates'
import type { ISODate, PerUSD, Salary, Transaction } from './types'

/** Id fixo por salário e mês: dois aparelhos criando o mesmo mês gravam o mesmo registro, sem duplicar. */
export const salaryTxId = (salaryId: string, mes: string) => `sal-${salaryId}-${mes}`

/** Meses em que o salário já caiu (do início até hoje, respeitando o fim e os meses apagados à mão). */
export function salaryMonths(s: Salary, hoje: ISODate): string[] {
  const out: string[] = []
  const last = s.fim && s.fim < hoje.slice(0, 7) ? s.fim : hoje.slice(0, 7)
  for (let m = s.inicio; m <= last; m = addMonths(m, 1)) {
    if (clampedDate(m, s.dia) <= hoje && !s.puladas?.includes(m)) out.push(m)
  }
  return out
}

/** Próxima data em que o salário cai (hoje ou depois), ou null se já acabou. */
export function nextSalaryDate(s: Salary, hoje: ISODate): ISODate | null {
  for (let m = s.inicio > hoje.slice(0, 7) ? s.inicio : hoje.slice(0, 7), i = 0; i < 24; m = addMonths(m, 1), i++) {
    if (s.fim && m > s.fim) return null
    const d = clampedDate(m, s.dia)
    if (d >= hoje && !s.puladas?.includes(m)) return d
  }
  return null
}

/** A entrada de um mês do salário. O câmbio é o do momento em que foi criada. */
export function buildSalaryTx(s: Salary, mes: string, { now, perUSD }: { now: string; perUSD: PerUSD }): Transaction {
  return {
    id: salaryTxId(s.id, mes),
    createdAt: now,
    updatedAt: now,
    tipo: 'entrada',
    valorCents: s.valorCents,
    moeda: s.moeda,
    data: clampedDate(mes, s.dia),
    categoriaId: s.categoriaId,
    descricao: s.descricao,
    pessoa: s.pessoa,
    dizimo: s.dizimo !== false,
    salarioId: s.id,
    cambio: perUSD,
  }
}
