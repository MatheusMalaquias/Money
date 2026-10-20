import { useState } from 'react'
import { summarizeTotals } from '../domain/balance'
import { todayISO } from '../domain/dates'
import { centsToInput, convert, formatMoney, parseAmount } from '../domain/money'
import type { Currency, PersonId, Transaction } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, Segmented, inputCls, peopleOptions } from './fields'
import { Sheet } from './Sheet'

export type ReserveMode = 'in' | 'add' | 'out'

/** Nome e símbolo de um movimento da reserva, usado nas listas. */
export function reserveInfo(t: Pick<Transaction, 'retirada' | 'aporte'>): { title: string; sign: string } {
  if (t.aporte) return { title: 'Já tinha na reserva', sign: '+' }
  if (t.retirada) return { title: 'Retirada da reserva', sign: '↩' }
  return { title: 'Guardado na reserva', sign: '→' }
}

/** Guardar dinheiro na reserva (sai do total), tirar dela (volta ao total) ou informar o que a reserva já tinha. */
export default function ReserveSheet({ tx, defaultPessoa, initialMode = 'in', onClose }: { tx: Transaction | null; defaultPessoa: PersonId; initialMode?: ReserveMode; onClose: () => void }) {
  const { settings, transactions, saveTransaction, removeTransaction } = useApp()
  const display = settings.moedaExibicao
  const [mode, setMode] = useState<ReserveMode>(tx ? (tx.retirada ? 'out' : tx.aporte ? 'add' : 'in') : initialMode)
  const [amount, setAmount] = useState(tx ? centsToInput(tx.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(tx?.moeda ?? settings.moedaExibicao)
  const [data, setData] = useState(tx?.data ?? todayISO())
  const [pessoa, setPessoa] = useState<PersonId>(tx?.pessoa ?? defaultPessoa)
  const [descricao, setDescricao] = useState(tx?.descricao ?? '')
  const cents = parseAmount(amount)

  // limite: só dá para guardar até o saldo de agora, e tirar até o que há na reserva (sem contar este mesmo movimento, se estiver editando)
  const now0 = summarizeTotals({ transactions: transactions.filter((x) => x.id !== tx?.id), ate: todayISO(), moeda: display, pessoa: 'todos' })
  const limit = mode === 'in' ? now0.total : mode === 'out' ? now0.reserva : Infinity
  const needed = cents === null ? 0 : convert(cents, moeda, display, settings.rates.perUSD)
  const over = mode !== 'add' && needed > Math.max(0, limit)

  const save = async () => {
    const now = nowISO()
    await saveTransaction({
      ...(tx ?? { id: newId(), createdAt: now }),
      tipo: 'reserva',
      retirada: mode === 'out',
      aporte: mode === 'add',
      valorCents: cents!,
      moeda,
      data,
      categoriaId: '',
      pessoa,
      descricao: descricao.trim(),
      updatedAt: now,
      cambio: tx && tx.moeda === moeda ? tx.cambio : settings.rates.perUSD,
    })
    onClose()
  }

  return (
    <Sheet
      title={tx ? 'Editar movimento da reserva' : 'Reserva'}
      onClose={onClose}
      onSubmit={save}
      canSubmit={cents !== null && cents > 0 && !!data && !over}
      danger={tx ? [{ label: 'Excluir', onClick: async () => { await removeTransaction(tx.id); onClose() } }] : undefined}
    >
      <Segmented label="Operação" value={mode} onChange={setMode} options={[{ value: 'in', label: 'Guardar' }, { value: 'out', label: 'Tirar' }, { value: 'add', label: 'Já tinha' }]} />
      <Field label="Valor">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <Field label="Descrição (opcional)">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Reserva de emergência" className={inputCls} />
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
      {over ? (
        <p role="alert" className="text-xs text-bad">
          {mode === 'in' ? `Só há ${formatMoney(Math.max(0, limit), display)} de saldo para guardar.` : `Só há ${formatMoney(Math.max(0, limit), display)} na reserva para tirar.`}
        </p>
      ) : (
        <p className="text-xs text-muted">
          {mode === 'in' && `Sai do total e vai para a reserva. Dá para guardar até ${formatMoney(Math.max(0, limit), display)} (o saldo de agora).`}
          {mode === 'out' && `Volta da reserva para o total. Dá para tirar até ${formatMoney(Math.max(0, limit), display)} (o que há na reserva).`}
          {mode === 'add' && 'Para o dinheiro que a reserva já tinha antes de usar o app. Só soma na reserva e não mexe no total.'}
        </p>
      )}
    </Sheet>
  )
}
