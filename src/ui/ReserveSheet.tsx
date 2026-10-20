import { useState } from 'react'
import { todayISO } from '../domain/dates'
import { centsToInput, parseAmount } from '../domain/money'
import type { Currency, PersonId, Transaction } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, Segmented, inputCls, peopleOptions } from './fields'
import { Sheet } from './Sheet'

/** Guardar uma parte do dinheiro na reserva, ou tirar dela. Não é gasto: só muda o que está disponível. */
export default function ReserveSheet({ tx, defaultPessoa, onClose }: { tx: Transaction | null; defaultPessoa: PersonId; onClose: () => void }) {
  const { settings, saveTransaction, removeTransaction } = useApp()
  const [mode, setMode] = useState<'in' | 'out'>(tx?.retirada ? 'out' : 'in')
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
      <Segmented label="Operação" value={mode} onChange={setMode} options={[{ value: 'in', label: 'Guardar na reserva' }, { value: 'out', label: 'Tirar da reserva' }]} />
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
      <p className="text-xs text-muted">O dinheiro da reserva continua sendo de vocês: o total não muda, só o que está disponível para gastar.</p>
    </Sheet>
  )
}
