import { useState } from 'react'
import { monthKey, todayISO, toBR } from '../domain/dates'
import { centsToInput, convert, formatMoney, parseAmount } from '../domain/money'
import { DEFAULT_TITHE_BPS, titheAmount } from '../domain/tithe'
import { type Currency, type PersonId, type Transaction } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, PersonFilter, Segmented, inputCls, peopleOptions, personName } from '../ui/fields'
import { MonthNav } from '../ui/MonthNav'
import { Card, Screen } from '../ui/Screen'
import { Fab, Sheet } from '../ui/Sheet'

interface Props {
  mes: string
  onMes: (m: string) => void
  pessoa: PersonId | 'todos'
  onPessoa: (p: PersonId | 'todos') => void
}

export default function Lancar({ mes, onMes, pessoa, onPessoa }: Props) {
  const { transactions, categories, settings } = useApp()
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const display = settings.moedaExibicao
  const cat = (id: string) => categories.find((c) => c.id === id)
  // valor real do dízimo de cada entrada (pode diferir de hoje se o percentual mudou depois)
  const dizimoDe = new Map(transactions.filter((t) => t.dizimoDeId).map((t) => [t.dizimoDeId!, t.valorCents]))

  const list = transactions
    .filter((t) => monthKey(t.data) === mes && (pessoa === 'todos' || t.pessoa === pessoa))
    .sort((a, b) => b.data.localeCompare(a.data) || b.createdAt.localeCompare(a.createdAt))

  return (
    <Screen title="Lançamentos" subtitle="Entradas e saídas">
      <MonthNav mes={mes} onChange={onMes} />
      <PersonFilter settings={settings} value={pessoa} onChange={onPessoa} />

      {list.length === 0 ? (
        <Card className="border-dashed text-sm text-muted">Nenhum lançamento neste mês. Toque em + para registrar um salário ou um gasto.</Card>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => {
            const c = cat(t.categoriaId)
            const entrada = t.tipo === 'entrada'
            return (
              <li key={t.id}>
                <button onClick={() => setEditing(t.dizimoDeId ? transactions.find((x) => x.id === t.dizimoDeId) ?? t : t)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left">
                  <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: c?.cor ?? '#94a3b8' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.descricao || c?.nome || 'Sem descrição'}</span>
                    <span className="block truncate text-xs text-muted">
                      {toBR(t.data)} · {c?.nome ?? '—'} · {personName(settings, t.pessoa)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`num block text-sm font-semibold ${entrada ? 'text-good' : 'text-main'}`}>
                      {entrada ? '+' : '−'} {formatMoney(t.valorCents, t.moeda)}
                    </span>
                    {entrada && t.dizimo && dizimoDe.has(t.id) && (
                      <span className="num block text-xs text-muted">líquido {formatMoney(t.valorCents - dizimoDe.get(t.id)!, t.moeda)}</span>
                    )}
                    {t.moeda !== display && (
                      <span className="num block text-xs text-muted">≈ {formatMoney(convert(t.valorCents, t.moeda, display, t.cambio), display)}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Fab onClick={() => setEditing('new')} label="Novo lançamento" />
      {editing && <TransactionSheet tx={editing === 'new' ? null : editing} defaultPessoa={pessoa === 'todos' ? settings.pessoas[0].id : pessoa} onClose={() => setEditing(null)} />}
    </Screen>
  )
}

function TransactionSheet({ tx, defaultPessoa, onClose }: { tx: Transaction | null; defaultPessoa: PersonId; onClose: () => void }) {
  const { categories, settings, saveTransaction, removeTransaction } = useApp()
  const [tipo, setTipo] = useState<Transaction['tipo']>(tx?.tipo ?? 'saida')
  const [amount, setAmount] = useState(tx ? centsToInput(tx.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(tx?.moeda ?? settings.moedaExibicao)
  const [data, setData] = useState(tx?.data ?? todayISO())
  const [categoriaId, setCategoriaId] = useState(tx?.categoriaId ?? categories[0]?.id ?? '')
  const [pessoa, setPessoa] = useState<PersonId>(tx?.pessoa ?? defaultPessoa)
  const [descricao, setDescricao] = useState(tx?.descricao ?? '')
  // entrada nova já nasce com dízimo; entradas antigas (sem o campo) ficam como estavam
  const [dizimo, setDizimo] = useState(tx ? !!tx.dizimo : true)
  const bps = settings.dizimoBps ?? DEFAULT_TITHE_BPS
  const cents = parseAmount(amount)
  const valid = cents !== null && cents > 0 && !!data && !!categoriaId

  const save = async () => {
    const now = nowISO()
    await saveTransaction({
      ...(tx ?? { id: newId(), createdAt: now, contaId: undefined }),
      tipo,
      valorCents: cents!,
      moeda,
      data,
      categoriaId,
      pessoa,
      descricao: descricao.trim(),
      dizimo: tipo === 'entrada' ? dizimo : undefined,
      updatedAt: now,
      // novo lançamento fixa o câmbio do dia; ao editar, só refixa se a moeda ou o valor mudaram de moeda
      cambio: tx && tx.moeda === moeda ? tx.cambio : settings.rates.perUSD,
    })
    onClose()
  }

  return (
    <Sheet
      title={tx ? 'Editar lançamento' : 'Novo lançamento'}
      onClose={onClose}
      onSubmit={save}
      canSubmit={valid}
      danger={tx ? [{ label: tx.contaId ? 'Desfazer pagamento' : 'Excluir', onClick: async () => { await removeTransaction(tx.id); onClose() } }] : undefined}
    >
      <Segmented
        label="Tipo"
        value={tipo}
        onChange={setTipo}
        options={[{ value: 'saida', label: 'Saída' }, { value: 'entrada', label: 'Entrada' }]}
      />
      <Field label="Valor">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <Field label="Descrição">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'entrada' ? 'Ex.: Salário' : 'Ex.: Mercado'} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Quem">
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
      {tipo === 'entrada' && bps > 0 && (
        <div className="space-y-2 rounded-lg bg-raised px-3 py-2.5 text-sm">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={dizimo} onChange={(e) => setDizimo(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
            <span className="flex-1">Descontar dízimo ({bps / 100}%)</span>
          </label>
          {cents !== null && cents > 0 && (
            <dl className="num space-y-1 border-t border-line pt-2 text-xs">
              <div className="flex justify-between"><dt className="text-muted">Valor recebido</dt><dd>{formatMoney(cents, moeda)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Dízimo ({bps / 100}%)</dt><dd className={dizimo ? '' : 'text-muted line-through'}>− {formatMoney(titheAmount(cents, bps), moeda)}</dd></div>
              <div className="flex justify-between text-sm font-semibold"><dt>Fica com vocês</dt><dd>{formatMoney(dizimo ? cents - titheAmount(cents, bps) : cents, moeda)}</dd></div>
            </dl>
          )}
        </div>
      )}
      {tx?.contaId && <p className="text-xs text-muted">Gerado ao pagar uma conta. Excluir desfaz o pagamento.</p>}
    </Sheet>
  )
}
