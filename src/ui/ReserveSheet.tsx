import { useState } from 'react'
import { todayISO } from '../domain/dates'
import { centsToInput, parseAmount } from '../domain/money'
import type { Currency, PersonId, Transaction } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, Segmented, inputCls, peopleOptions } from './fields'
import { Sheet } from './Sheet'

export type ReserveMode = 'in' | 'add' | 'out'

/** Nome e símbolo de um movimento da reserva, usado nas listas. */
export function reserveInfo(t: Pick<Transaction, 'retirada' | 'aporte'>): { title: string; sign: string } {
  if (t.aporte) return { title: 'Valor adicionado à reserva', sign: '+' }
  if (t.retirada) return { title: 'Retirada da reserva', sign: '↩' }
  return { title: 'Guardado do disponível', sign: '→' }
}

/** Guardar uma parte do dinheiro na reserva, ou tirar dela. Não é gasto: só muda o que está disponível. */
export default function ReserveSheet({ tx, defaultPessoa, initialMode = 'in', onClose }: { tx: Transaction | null; defaultPessoa: PersonId; initialMode?: ReserveMode; onClose: () => void }) {
  const { settings, saveTransaction, removeTransaction } = useApp()
  const [mode, setMode] = useState<ReserveMode>(tx ? (tx.retirada ? 'out' : tx.aporte ? 'add' : 'in') : initialMode)
  const [amount, setAmount] = useState(tx ? centsToInput(tx.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(tx?.moeda ?? settings.moedaExibicao)
  const [data, setData] = useState(tx?.data ?? todayISO())
  const [pessoa, setPessoa] = useState<PersonId>(tx?.pessoa ?? defaultPessoa)
  const [descricao, setDescricao] = useState(tx?.descricao ?? '')
  const cents = parseAmount(amount)

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
      canSubmit={cents !== null && cents > 0 && !!data}
      danger={tx ? [{ label: 'Excluir', onClick: async () => { await removeTransaction(tx.id); onClose() } }] : undefined}
    >
      <Segmented label="Operação" value={mode} onChange={setMode} options={[{ value: 'add', label: 'Adicionar' }, { value: 'in', label: 'Guardar' }, { value: 'out', label: 'Tirar' }]} />
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
      <p className="text-xs text-muted">
        {mode === 'add' && 'Dinheiro novo na reserva (que já tinham guardado ou veio de fora): o total e a reserva sobem juntos.'}
        {mode === 'in' && 'Separa uma parte do que já está disponível: o total não muda, só diminui o disponível.'}
        {mode === 'out' && 'Devolve da reserva para o disponível: o total não muda.'}
      </p>
    </Sheet>
  )
}
