import { billState, dueLabel } from '../domain/bills'
import { toBR } from '../domain/dates'
import { convert, formatMoney } from '../domain/money'
import type { Bill, Recurrence } from '../domain/types'
import { useApp } from '../state/data'
import { personName } from './fields'

const REC_LABEL: Record<Recurrence, string> = { unica: 'Única', mensal: 'Mensal', anual: 'Anual' }
const URGENCY_CLS = { paga: 'text-muted', atrasada: 'text-bad font-medium', urgente: 'text-warn font-medium', normal: 'text-muted' } as const

/** Parcelas ainda pendentes da mesma conta (incluindo esta). */
const remaining = (bills: Bill[], b: Bill) => bills.filter((x) => x.serieId === b.serieId && x.status === 'pendente').length

/** Uma conta na lista: círculo para marcar como paga, dados da conta e valor. Tocar abre a edição. */
export default function BillRow({ b, today, onEdit }: { b: Bill; today: string; onEdit: (b: Bill) => void }) {
  const { bills, categories, settings, pay, unpay } = useApp()
  const display = settings.moedaExibicao
  const st = billState(b, today)
  const due = dueLabel(b, today)
  const cat = categories.find((c) => c.id === b.categoriaId)
  const paid = b.status === 'paga'
  return (
    <li className={`flex items-center gap-3 rounded-xl border bg-card px-3 py-3 ${st === 'vencida' ? 'border-bad/60' : st === 'semana' ? 'border-warn/50' : 'border-line'}`}>
      <button
        onClick={() => (paid ? unpay(b.id) : pay(b.id))}
        aria-label={paid ? 'Desfazer pagamento' : 'Marcar como paga'}
        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm before:absolute before:-inset-2 before:content-[''] ${paid ? 'border-good bg-good text-on-accent' : 'border-muted'}`}
      >
        {paid ? '✓' : ''}
      </button>
      <button onClick={() => onEdit(b)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${paid ? 'line-through opacity-60' : ''}`}>{b.descricao}</span>
          <span className={`block truncate text-xs ${URGENCY_CLS[due.urgency]}`}>{due.text}</span>
          <span className="block truncate text-xs text-muted">
            {cat?.nome ?? '—'} · {REC_LABEL[b.recorrencia]} · {personName(settings, b.pessoa)}
            {b.cartao ? ' · Cartão' : ''}
          </span>
          {b.fim && !paid && (
            <span className="block truncate text-xs text-muted">
              Até {toBR(b.fim).slice(3)} · {remaining(bills, b)} {remaining(bills, b) === 1 ? 'restante' : 'restantes'}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-sm font-semibold">{formatMoney(b.valorCents, b.moeda)}</span>
          {b.moeda !== display && <span className="num block text-xs text-muted">≈ {formatMoney(convert(b.valorCents, b.moeda, display, settings.rates.perUSD), display)}</span>}
        </span>
      </button>
    </li>
  )
}
