import { endOfMonth, summarizeTotals } from './balance'
import { addMonths, toBR } from './dates'
import { convert } from './money'
import type { Category, Currency, PersonId, Settings, Transaction } from './types'

export interface MonthRow {
  mes: string
  recebido: number
  dizimo: number
  /** Contas pagas e gastos, sem o dízimo. */
  gastos: number
  /** recebido − dízimo − gastos */
  sobra: number
}

interface Args {
  transactions: Transaction[]
  /** Último mês da janela ("YYYY-MM"). */
  mes: string
  meses?: number
  moeda: Currency
  pessoa: PersonId | 'todos'
}

const window = (mes: string, meses: number): string[] => Array.from({ length: meses }, (_, i) => addMonths(mes, i - (meses - 1)))

/** Recebido, dízimo, gastos e sobra de cada mês da janela, do mais antigo ao mais recente. Usa o câmbio de cada lançamento. */
export function monthlySeries({ transactions, mes, meses = 6, moeda, pessoa }: Args): MonthRow[] {
  const rows = new Map(window(mes, meses).map((m) => [m, { mes: m, recebido: 0, dizimo: 0, gastos: 0, sobra: 0 }]))
  for (const t of transactions) {
    const row = rows.get(t.data.slice(0, 7))
    if (!row || t.tipo === 'reserva' || (pessoa !== 'todos' && t.pessoa !== pessoa)) continue
    const v = convert(t.valorCents, t.moeda, moeda, t.cambio)
    if (t.tipo === 'entrada') row.recebido += v
    else if (t.dizimoDeId) row.dizimo += v
    else row.gastos += v
  }
  return [...rows.values()].map((r) => ({ ...r, sobra: r.recebido - r.dizimo - r.gastos }))
}

/** Gastos por categoria na janela, do maior para o menor (sem o dízimo, que tem relatório próprio). */
export function categorySpend({ transactions, mes, meses = 6, moeda, pessoa }: Args): { categoriaId: string; total: number }[] {
  const months = new Set(window(mes, meses))
  const by = new Map<string, number>()
  for (const t of transactions) {
    if (t.tipo !== 'saida' || t.dizimoDeId || !months.has(t.data.slice(0, 7)) || (pessoa !== 'todos' && t.pessoa !== pessoa)) continue
    by.set(t.categoriaId, (by.get(t.categoriaId) ?? 0) + convert(t.valorCents, t.moeda, moeda, t.cambio))
  }
  return [...by].map(([categoriaId, total]) => ({ categoriaId, total })).sort((a, b) => b.total - a.total)
}

export interface EvolutionPoint {
  mes: string
  total: number
  reserva: number
}

/** O total e a reserva no fim de cada mês da janela. */
export function evolution({ transactions, mes, meses = 6, moeda, pessoa }: Args): EvolutionPoint[] {
  return window(mes, meses).map((m) => {
    const t = summarizeTotals({ transactions, ate: endOfMonth(m), moeda, pessoa })
    return { mes: m, total: t.total, reserva: t.reserva }
  })
}

/** Média mensal da sobra, só dos meses com movimento. Null se não houve nenhum. */
export function averageLeftover(rows: MonthRow[]): number | null {
  const active = rows.filter((r) => r.recebido > 0 || r.gastos > 0 || r.dizimo > 0)
  if (active.length === 0) return null
  return Math.round(active.reduce((s, r) => s + r.sobra, 0) / active.length)
}

/** 123456 → "1234,56" (texto para planilha, sem float). */
const plain = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`

/** Campo de CSV: aspas quando preciso, e trava de fórmula (=, +, -, @) para a planilha não executar o texto. */
function field(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Todos os lançamentos em CSV para planilha (separador ";", vírgula decimal, com BOM para o Excel abrir os acentos). */
export function transactionsToCSV(transactions: Transaction[], categories: Category[], settings: Settings): string {
  const cat = new Map(categories.map((c) => [c.id, c.nome]))
  const people = new Map([...settings.pessoas.map((p) => [p.id, p.nome] as const), ['casal', 'Todos'] as const])
  const display = settings.moedaExibicao
  const head = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Pessoa', 'Valor', 'Moeda', `Valor em ${display}`]
  const kind = (t: Transaction) => (t.tipo === 'entrada' ? 'Entrada' : t.tipo === 'saida' ? (t.dizimoDeId ? 'Dízimo' : 'Saída') : t.aporte ? 'Reserva (já tinha)' : t.retirada ? 'Reserva (retirada)' : 'Reserva (guardado)')
  const lines = [...transactions]
    .sort((a, b) => a.data.localeCompare(b.data) || a.createdAt.localeCompare(b.createdAt))
    .map((t) =>
      [toBR(t.data), kind(t), t.descricao, cat.get(t.categoriaId) ?? '', people.get(t.pessoa) ?? t.pessoa, plain(t.valorCents), t.moeda, plain(convert(t.valorCents, t.moeda, display, t.cambio))].map(field).join(';')
    )
  return `\uFEFF${[head.map(field).join(';'), ...lines].join('\r\n')}\r\n`
}
