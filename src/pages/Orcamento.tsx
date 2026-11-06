import { useMemo, useState } from 'react'
import { summarizeBudget, type BudgetLevel, type BudgetRow } from '../domain/budget'
import { centsToInput, formatMoney, parseAmount } from '../domain/money'
import type { Budget, Currency } from '../domain/types'
import { useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, inputCls } from '../ui/fields'
import { Card } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'

const LEVEL: Record<BudgetLevel, { mark: string; text: string; cls: string; bar: string }> = {
  ok: { mark: '✓', text: 'Dentro do limite', cls: 'text-good', bar: 'rgb(var(--accent))' },
  perto: { mark: '▲', text: 'Perto do limite', cls: 'text-warn', bar: 'rgb(var(--warn))' },
  passa: { mark: '▲', text: 'Vai passar com as contas', cls: 'text-warn', bar: 'rgb(var(--warn))' },
  estourou: { mark: '!', text: 'Estourou', cls: 'text-bad', bar: 'rgb(var(--bad))' },
}

/** Limite mensal por categoria (mercado, lazer, estudos…) comparado com o que já foi gasto e com as contas que ainda vão vencer. */
export default function Orcamento({ mes }: { mes: string }) {
  const { transactions, bills, categories, settings } = useApp()
  const display = settings.moedaExibicao
  const money = (c: number) => formatMoney(c, display)
  const budgets = settings.orcamentos ?? []
  const [editing, setEditing] = useState<{ categoriaId: string } | 'new' | null>(null)
  const cat = (id: string) => categories.find((c) => c.id === id)

  const s = useMemo(
    () => summarizeBudget({ mes, budgets, transactions, bills, rates: settings.rates.perUSD, moeda: display }),
    [mes, budgets, transactions, bills, settings.rates.perUSD, display]
  )

  return (
    <div className="space-y-4">
      {s.rows.length > 0 ? (
        <Card className="divide-y divide-line py-1">
          <Row label="Limites do mês" value={money(s.limite)} />
          <Row label="Já gasto" value={money(s.gasto)} />
          <Row label="Contas ainda por pagar" value={money(s.previsto)} />
          <Row label="Sobra dos limites" value={money(s.limite - s.gasto - s.previsto)} cls={s.limite - s.gasto - s.previsto < 0 ? 'text-bad' : 'text-good'} strong />
        </Card>
      ) : (
        <Card className="space-y-1 border-dashed text-sm text-muted">
          <p>Defina quanto querem gastar por mês em cada categoria. O app compara com o que já foi pago e com as contas que ainda vão vencer.</p>
          <p>Ex.: Alimentação R$ 1.500, Lazer R$ 400, Educação R$ 300.</p>
        </Card>
      )}

      <button onClick={() => setEditing('new')} className="w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">Definir um limite</button>

      {s.rows.length > 0 && (
        <ul className="space-y-3">
          {s.rows.map((r) => (
            <li key={r.categoriaId}>
              <BudgetItem row={r} nome={cat(r.categoriaId)?.nome ?? 'Categoria apagada'} cor={cat(r.categoriaId)?.cor} money={money} onClick={() => setEditing({ categoriaId: r.categoriaId })} />
            </li>
          ))}
        </ul>
      )}

      {s.semLimite.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">Gastos sem limite</h3>
          <Card className="divide-y divide-line py-1">
            {s.semLimite.map((x) => (
              <button key={x.categoriaId} onClick={() => setEditing({ categoriaId: x.categoriaId })} className="flex w-full items-center gap-3 py-2.5 text-left text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat(x.categoriaId)?.cor ?? '#94a3b8' }} />
                <span className="min-w-0 flex-1 truncate">{cat(x.categoriaId)?.nome ?? 'Categoria apagada'}</span>
                <span className="num shrink-0 font-medium">{money(x.total)}</span>
                <span aria-hidden className="text-muted">›</span>
              </button>
            ))}
          </Card>
          <p className="text-xs text-muted">Toque para definir um limite. O dízimo não entra aqui.</p>
        </section>
      )}
      <p className="text-center text-xs text-muted">Os limites valem para o casal: o filtro de pessoa não muda estas contas.</p>

      {editing && <BudgetSheet initial={editing === 'new' ? null : editing.categoriaId} onClose={() => setEditing(null)} />}
    </div>
  )
}

const Row = ({ label, value, cls = '', strong }: { label: string; value: string; cls?: string; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
    <span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span>
    <span className={`num ${strong ? 'text-base font-semibold' : 'font-medium'} ${cls}`}>{value}</span>
  </div>
)

function BudgetItem({ row, nome, cor, money, onClick }: { row: BudgetRow; nome: string; cor?: string; money: (c: number) => string; onClick: () => void }) {
  const ui = LEVEL[row.nivel]
  const pct = (v: number) => Math.min(100, (v / row.limite) * 100)
  const gastoPct = pct(row.gasto)
  const previstoPct = Math.min(100 - gastoPct, pct(row.previsto))
  return (
    <Card className="p-0">
      <button onClick={onClick} className="block w-full space-y-2 p-4 text-left" aria-label={`${nome}: ${money(row.gasto)} de ${money(row.limite)}. ${ui.text}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor ?? '#94a3b8' }} />
            <span className="truncate">{nome}</span>
          </span>
          <span className="num shrink-0 text-xs text-muted">{Math.round((row.gasto / row.limite) * 100)}%</span>
        </div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-r bg-raised">
          <div className="h-full" style={{ width: `${gastoPct}%`, background: ui.bar }} />
          {previstoPct > 0 && <div className="h-full opacity-40" style={{ width: `${previstoPct}%`, background: ui.bar }} />}
        </div>
        <div className="num flex items-baseline justify-between gap-2 text-xs">
          <span><b className="font-semibold">{money(row.gasto)}</b> <span className="text-muted">de {money(row.limite)}</span></span>
          <span className={row.restante < 0 ? 'text-bad' : 'text-muted'}>{row.restante < 0 ? `passa ${money(-row.restante)}` : `sobram ${money(row.restante)}`}</span>
        </div>
        {(row.previsto > 0 || row.nivel !== 'ok') && (
          <p className={`text-xs ${ui.cls}`}>
            <span aria-hidden>{ui.mark}</span> {ui.text}
            {row.previsto > 0 && <span className="num text-muted"> · {money(row.previsto)} em contas por pagar</span>}
          </p>
        )}
      </button>
    </Card>
  )
}

function BudgetSheet({ initial, onClose }: { initial: string | null; onClose: () => void }) {
  const { settings, categories, updateSettings } = useApp()
  const budgets = settings.orcamentos ?? []
  const current = budgets.find((b) => b.categoriaId === initial)
  const free = categories.filter((c) => !c.chave && (c.id === initial || !budgets.some((b) => b.categoriaId === c.id)))
  const [categoriaId, setCategoriaId] = useState(initial ?? free[0]?.id ?? '')
  const [amount, setAmount] = useState(current ? centsToInput(current.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(current?.moeda ?? settings.moedaExibicao)
  const cents = parseAmount(amount)

  const save = async () => {
    const next: Budget = { categoriaId, valorCents: cents!, moeda }
    await updateSettings({ orcamentos: [...budgets.filter((b) => b.categoriaId !== categoriaId), next] })
    onClose()
  }

  return (
    <Sheet
      title={current ? 'Editar limite' : 'Novo limite mensal'}
      onClose={onClose}
      onSubmit={save}
      canSubmit={cents !== null && cents > 0 && !!categoriaId}
      danger={current ? [{ label: 'Remover limite', onClick: async () => { await updateSettings({ orcamentos: budgets.filter((b) => b.categoriaId !== current.categoriaId) }); onClose() } }] : undefined}
    >
      <Field label="Categoria">
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} disabled={!!initial && !!current} className={inputCls}>
          {free.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>
      <Field label="Quanto gastar por mês, no máximo">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <p className="text-xs text-muted">Conta o que já foi pago e lançado nesta categoria no mês, mais as contas que ainda vão vencer nele. Vale para todos os meses.</p>
    </Sheet>
  )
}
