import { useState } from 'react'
import { billState, sortBills } from '../domain/bills'
import { diffDays, todayISO, toBR } from '../domain/dates'
import { centsToInput, convert, formatMoney, parseAmount } from '../domain/money'
import type { Bill, Currency, PersonId, Recurrence } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, PersonFilter, Segmented, inputCls, peopleOptions, personName } from '../ui/fields'
import { Card, Screen } from '../ui/Screen'
import { Fab, Sheet } from '../ui/Sheet'

const REC_LABEL: Record<Recurrence, string> = { unica: 'Única', mensal: 'Mensal', anual: 'Anual' }

function dueText(b: Bill, today: string): { text: string; cls: string } {
  if (b.status === 'paga') return { text: `Paga em ${toBR(b.pagaEm!)}`, cls: 'text-muted' }
  const d = diffDays(today, b.vencimento)
  if (d < 0) return { text: `Vencida há ${-d} ${-d === 1 ? 'dia' : 'dias'}`, cls: 'text-bad font-medium' }
  if (d === 0) return { text: 'Vence hoje', cls: 'text-warn font-medium' }
  if (d <= 7) return { text: `Vence em ${d} ${d === 1 ? 'dia' : 'dias'}`, cls: 'text-warn font-medium' }
  return { text: `Vence ${toBR(b.vencimento)}`, cls: 'text-muted' }
}

export default function Contas({ pessoa, onPessoa }: { pessoa: PersonId | 'todos'; onPessoa: (p: PersonId | 'todos') => void }) {
  const { bills, categories, settings, pay, unpay } = useApp()
  const [tab, setTab] = useState<'pendente' | 'paga'>('pendente')
  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const today = todayISO()
  const display = settings.moedaExibicao

  const visible = sortBills(bills.filter((b) => b.status === tab && (pessoa === 'todos' || b.pessoa === pessoa)))
  const pendingTotal = bills
    .filter((b) => b.status === 'pendente' && (pessoa === 'todos' || b.pessoa === pessoa))
    .reduce((sum, b) => sum + convert(b.valorCents, b.moeda, display, settings.rates.perUSD), 0)
  const overdue = bills.filter((b) => billState(b, today) === 'vencida' && (pessoa === 'todos' || b.pessoa === pessoa)).length

  return (
    <Screen title="Contas a pagar" subtitle={tab === 'pendente' ? `Pendentes: ${formatMoney(pendingTotal, display)}` : 'Histórico de pagamentos'}>
      <PersonFilter settings={settings} value={pessoa} onChange={onPessoa} />
      <Segmented label="Situação" value={tab} onChange={setTab} options={[{ value: 'pendente', label: overdue ? `Pendentes · ${overdue} vencida${overdue > 1 ? 's' : ''}` : 'Pendentes' }, { value: 'paga', label: 'Pagas' }]} />

      {visible.length === 0 ? (
        <Card className="border-dashed text-sm text-muted">{tab === 'pendente' ? 'Nenhuma conta pendente. Toque em + para cadastrar aluguel, internet, cartão…' : 'Nenhuma conta paga ainda.'}</Card>
      ) : (
        <ul className="space-y-2">
          {visible.map((b) => {
            const st = billState(b, today)
            const due = dueText(b, today)
            const cat = categories.find((c) => c.id === b.categoriaId)
            const paid = b.status === 'paga'
            return (
              <li key={b.id} className={`flex items-center gap-3 rounded-xl border bg-card px-3 py-3 ${st === 'vencida' ? 'border-bad/60' : st === 'semana' ? 'border-warn/50' : 'border-line'}`}>
                <button
                  onClick={() => (paid ? unpay(b.id) : pay(b.id))}
                  aria-label={paid ? 'Desfazer pagamento' : 'Marcar como paga'}
                  className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm before:absolute before:-inset-2 before:content-[''] ${paid ? 'border-good bg-good text-on-accent' : 'border-muted'}`}
                >
                  {paid ? '✓' : ''}
                </button>
                <button onClick={() => setEditing(b)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${paid ? 'line-through opacity-60' : ''}`}>{b.descricao}</span>
                    <span className={`block truncate text-xs ${due.cls}`}>{due.text}</span>
                    <span className="block truncate text-xs text-muted">
                      {cat?.nome ?? '—'} · {REC_LABEL[b.recorrencia]} · {personName(settings, b.pessoa)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm font-semibold">{formatMoney(b.valorCents, b.moeda)}</span>
                    {b.moeda !== display && <span className="num block text-xs text-muted">≈ {formatMoney(convert(b.valorCents, b.moeda, display, settings.rates.perUSD), display)}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Fab onClick={() => setEditing('new')} label="Nova conta" />
      {editing && <BillSheet bill={editing === 'new' ? null : editing} defaultPessoa={pessoa === 'todos' ? 'casal' : pessoa} onClose={() => setEditing(null)} />}
    </Screen>
  )
}

function BillSheet({ bill, defaultPessoa, onClose }: { bill: Bill | null; defaultPessoa: PersonId; onClose: () => void }) {
  const { categories, settings, saveBill, removeBill } = useApp()
  const [descricao, setDescricao] = useState(bill?.descricao ?? '')
  const [amount, setAmount] = useState(bill ? centsToInput(bill.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(bill?.moeda ?? settings.moedaExibicao)
  const [vencimento, setVencimento] = useState(bill?.vencimento ?? todayISO())
  const [categoriaId, setCategoriaId] = useState(bill?.categoriaId ?? categories[0]?.id ?? '')
  const [pessoa, setPessoa] = useState<PersonId>(bill?.pessoa ?? defaultPessoa)
  const [recorrencia, setRecorrencia] = useState<Recurrence>(bill?.recorrencia ?? 'mensal')
  const cents = parseAmount(amount)
  const paid = bill?.status === 'paga'
  const valid = descricao.trim().length > 0 && cents !== null && cents > 0 && !!vencimento && !!categoriaId

  const save = async () => {
    const now = nowISO()
    const base: Bill = bill ?? { id: newId(), createdAt: now, updatedAt: now, descricao: '', valorCents: 0, moeda, vencimento, diaAncora: 1, categoriaId, pessoa, recorrencia, status: 'pendente', serieId: newId() }
    await saveBill({
      ...base,
      descricao: descricao.trim(),
      valorCents: cents!,
      moeda,
      vencimento,
      // o dia escolhido vira a âncora: assim uma conta do dia 31 não "escorrega" para o 28 depois de fevereiro
      diaAncora: Number(vencimento.slice(8, 10)),
      categoriaId,
      pessoa,
      recorrencia,
      updatedAt: now,
    })
    onClose()
  }

  return (
    <Sheet
      title={bill ? 'Editar conta' : 'Nova conta'}
      onClose={onClose}
      onSubmit={save}
      canSubmit={valid}
      danger={bill && !paid ? { label: 'Excluir', onClick: async () => { await removeBill(bill.id); onClose() } } : undefined}
    >
      <Field label="Descrição">
        <input autoFocus={!bill} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Aluguel" className={inputCls} />
      </Field>
      <Field label="Valor">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vencimento">
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Quem paga">
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={inputCls}>
            {peopleOptions(settings).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Categoria">
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>
      <Field label="Repetição">
        <Segmented label="Repetição" value={recorrencia} onChange={setRecorrencia} options={[{ value: 'unica', label: 'Única' }, { value: 'mensal', label: 'Mensal' }, { value: 'anual', label: 'Anual' }]} />
      </Field>
      {paid && <p className="text-xs text-muted">Conta paga: para excluir, desfaça o pagamento antes.</p>}
    </Sheet>
  )
}
