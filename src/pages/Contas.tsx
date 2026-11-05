import { useState } from 'react'
import { billState, sortBills } from '../domain/bills'
import { todayISO } from '../domain/dates'
import { convert, formatMoney } from '../domain/money'
import type { Bill, PersonId } from '../domain/types'
import { useApp } from '../state/data'
import BillRow from '../ui/BillRow'
import BillSheet from '../ui/BillSheet'
import { PersonFilter, Segmented } from '../ui/fields'
import { Card, Screen } from '../ui/Screen'
import { Fab } from '../ui/Sheet'
import CalendarioContas from './CalendarioContas'

interface Props {
  pessoa: PersonId | 'todos'
  onPessoa: (p: PersonId | 'todos') => void
  mes: string
  onMes: (m: string) => void
}

export default function Contas({ pessoa, onPessoa, mes, onMes }: Props) {
  const { bills, settings } = useApp()
  const [view, setView] = useState<'lista' | 'calendario'>('lista')
  const [tab, setTab] = useState<'pendente' | 'paga'>('pendente')
  // `date` pré-preenche o vencimento quando a conta nova nasce de um toque no calendário
  const [editing, setEditing] = useState<{ bill: Bill | null; date?: string } | null>(null)
  const today = todayISO()
  const display = settings.moedaExibicao

  const visible = sortBills(bills.filter((b) => b.status === tab && (pessoa === 'todos' || b.pessoa === pessoa)))
  const pendingTotal = bills
    .filter((b) => b.status === 'pendente' && (pessoa === 'todos' || b.pessoa === pessoa))
    .reduce((sum, b) => sum + convert(b.valorCents, b.moeda, display, settings.rates.perUSD), 0)
  const overdue = bills.filter((b) => billState(b, today) === 'vencida' && (pessoa === 'todos' || b.pessoa === pessoa)).length

  return (
    <Screen title="Contas a pagar" subtitle={view === 'calendario' ? 'Calendário de vencimentos' : tab === 'pendente' ? `Pendentes: ${formatMoney(pendingTotal, display)}` : 'Histórico de pagamentos'}>
      <PersonFilter settings={settings} value={pessoa} onChange={onPessoa} />
      <Segmented label="Visão" value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'calendario', label: 'Calendário' }]} />

      {view === 'calendario' ? (
        <CalendarioContas mes={mes} onMes={onMes} pessoa={pessoa} onAdd={(date) => setEditing({ bill: null, date })} onEdit={(b) => setEditing({ bill: b })} />
      ) : (
        <>
          <Segmented label="Situação" value={tab} onChange={setTab} options={[{ value: 'pendente', label: overdue ? `Pendentes · ${overdue} vencida${overdue > 1 ? 's' : ''}` : 'Pendentes' }, { value: 'paga', label: 'Pagas' }]} />
          {visible.length === 0 ? (
            <Card className="border-dashed text-sm text-muted">{tab === 'pendente' ? 'Nenhuma conta pendente. Toque em + para cadastrar aluguel, internet, cartão…' : 'Nenhuma conta paga ainda.'}</Card>
          ) : (
            <ul className="space-y-2">
              {visible.map((b) => (
                <BillRow key={b.id} b={b} today={today} onEdit={(x) => setEditing({ bill: x })} />
              ))}
            </ul>
          )}
        </>
      )}

      {view === 'lista' && <Fab onClick={() => setEditing({ bill: null })} label="Nova conta" />}
      {editing && (
        <BillSheet
          bill={editing.bill}
          defaultPessoa={pessoa === 'todos' ? 'casal' : pessoa}
          defaultDate={editing.date}
          // leva para a lista onde a conta caiu
          onSaved={(paid) => setTab(paid ? 'paga' : 'pendente')}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  )
}
