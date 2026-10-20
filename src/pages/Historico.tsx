import { useMemo, useState } from 'react'
import { toBR } from '../domain/dates'
import { convert, formatMoney } from '../domain/money'
import { summarizeMonth } from '../domain/month'
import { type PersonId, type Transaction } from '../domain/types'
import { useApp } from '../state/data'
import { Segmented, personName } from '../ui/fields'
import { Card } from '../ui/Screen'
import ReserveSheet from '../ui/ReserveSheet'

type Kind = 'recebimentos' | 'pagamentos' | 'reserva'

/** Histórico do mês: o que foi recebido, o que foi pago e os movimentos da reserva. */
export default function Historico({ mes, pessoa }: { mes: string; pessoa: PersonId | 'todos' }) {
  const { transactions, bills, categories, settings } = useApp()
  const [kind, setKind] = useState<Kind>('recebimentos')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const display = settings.moedaExibicao
  const s = useMemo(
    () => summarizeMonth({ mes, transactions, bills, rates: settings.rates.perUSD, moeda: display, pessoa }),
    [mes, transactions, bills, settings.rates.perUSD, display, pessoa]
  )
  const month = (tipo: Transaction['tipo']) =>
    transactions
      .filter((t) => t.tipo === tipo && t.data.slice(0, 7) === mes && (pessoa === 'todos' || t.pessoa === pessoa))
      .sort((a, b) => b.data.localeCompare(a.data) || b.createdAt.localeCompare(a.createdAt))
  const list = month(kind === 'recebimentos' ? 'entrada' : kind === 'pagamentos' ? 'saida' : 'reserva')
  const dizimoDe = new Map(transactions.filter((t) => t.dizimoDeId).map((t) => [t.dizimoDeId!, t.valorCents]))
  const max = s.porCategoria[0]?.total ?? 1

  return (
    <div className="space-y-4">
      <Segmented
        label="Histórico"
        value={kind}
        onChange={setKind}
        options={[{ value: 'recebimentos', label: 'Recebido' }, { value: 'pagamentos', label: 'Pago' }, { value: 'reserva', label: 'Reserva' }]}
      />

      {kind === 'recebimentos' && (
        <Card className="divide-y divide-line py-1">
          <Row label="Recebido" value={formatMoney(s.entradas, display)} cls="text-good" />
          {s.dizimo > 0 && <Row label="Dízimo" value={`− ${formatMoney(s.dizimo, display)}`} small />}
          <Row label="Líquido" value={formatMoney(s.entradas - s.dizimo, display)} />
        </Card>
      )}

      {kind === 'pagamentos' && (
        <>
          <Card className="divide-y divide-line py-1">
            <Row label="Pago no mês" value={formatMoney(s.saidas, display)} />
            {s.dizimo > 0 && <Row label="· dos quais dízimo" value={formatMoney(s.dizimo, display)} small />}
            <Row label="Ainda falta pagar" value={formatMoney(s.faltaPagar, display)} cls={s.faltaPagar > 0 ? 'text-warn' : ''} />
          </Card>
          {s.porCategoria.length > 0 && (
            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-muted">Por categoria</h3>
              {s.porCategoria.map((row) => {
                const c = categories.find((x) => x.id === row.categoriaId)
                return (
                  <div key={row.categoriaId} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{c?.nome ?? '—'}</span>
                      <span className="num text-muted">
                        {formatMoney(row.total, display)} · {Math.round((row.total / s.saidas) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full" style={{ width: `${(row.total / max) * 100}%`, background: c?.cor ?? '#94a3b8' }} />
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
        </>
      )}

      {list.length === 0 ? (
        <Card className="border-dashed text-sm text-muted">
          {kind === 'recebimentos' ? 'Nada recebido neste mês.' : kind === 'pagamentos' ? 'Nenhum pagamento neste mês.' : 'Nenhum movimento da reserva neste mês.'}
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => {
            const cat = categories.find((c) => c.id === t.categoriaId)
            const liquido = kind === 'recebimentos' && dizimoDe.has(t.id) ? t.valorCents - dizimoDe.get(t.id)! : null
            const title = t.descricao || (t.tipo === 'reserva' ? (t.retirada ? 'Retirada da reserva' : 'Guardado na reserva') : cat?.nome || 'Sem descrição')
            const row = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{title}</span>
                  <span className="block truncate text-xs text-muted">
                    {toBR(t.data)} · {personName(settings, t.pessoa)}
                    {cat ? ` · ${cat.nome}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`num block text-sm font-semibold ${kind === 'recebimentos' ? 'text-good' : ''}`}>
                    {kind === 'recebimentos' ? '+ ' : kind === 'reserva' ? (t.retirada ? '↩ ' : '→ ') : '− '}
                    {formatMoney(t.valorCents, t.moeda)}
                  </span>
                  {liquido !== null && <span className="num block text-xs text-muted">líquido {formatMoney(liquido, t.moeda)}</span>}
                  {t.moeda !== display && <span className="num block text-xs text-muted">≈ {formatMoney(convert(t.valorCents, t.moeda, display, t.cambio), display)}</span>}
                </span>
              </>
            )
            return (
              <li key={t.id}>
                {kind === 'reserva' ? (
                  <button onClick={() => setEditing(t)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left">{row}</button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3">{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {kind !== 'reserva' && list.length > 0 && <p className="text-center text-xs text-muted">Para editar ou excluir, use a aba Lançar.</p>}

      {editing && <ReserveSheet tx={editing} defaultPessoa={editing.pessoa} onClose={() => setEditing(null)} />}
    </div>
  )
}

const Row = ({ label, value, cls = '', small = false }: { label: string; value: string; cls?: string; small?: boolean }) => (
  <div className="flex items-baseline justify-between py-2.5">
    <span className="text-sm text-muted">{label}</span>
    <span className={`num font-semibold ${small ? 'text-sm font-medium text-muted' : 'text-base'} ${cls}`}>{value}</span>
  </div>
)
