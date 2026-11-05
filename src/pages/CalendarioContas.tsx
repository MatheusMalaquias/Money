import { useEffect, useMemo, useState } from 'react'
import { billsByDay } from '../domain/bills'
import { calendarGrid, clampedDate, monthLabel, todayISO } from '../domain/dates'
import { convert, formatMoney } from '../domain/money'
import type { Bill, ISODate, PersonId } from '../domain/types'
import { DEFAULT_CARD } from '../domain/card'
import { useApp } from '../state/data'
import BillRow from '../ui/BillRow'
import { MonthNav } from '../ui/MonthNav'
import { Card } from '../ui/Screen'

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/** Calendário do mês com as contas no dia do vencimento. Tocar num dia mostra as contas dele e permite adicionar uma ali. */
export default function CalendarioContas({ mes, onMes, pessoa, onAdd, onEdit }: { mes: string; onMes: (m: string) => void; pessoa: PersonId | 'todos'; onAdd: (date: ISODate) => void; onEdit: (b: Bill) => void }) {
  const { bills, settings } = useApp()
  const display = settings.moedaExibicao
  const today = todayISO()
  const cfg = settings.cartao ?? DEFAULT_CARD
  const byDay = useMemo(() => billsByDay(bills, mes, pessoa), [bills, mes, pessoa])
  const grid = useMemo(() => calendarGrid(mes), [mes])
  const fecha = clampedDate(mes, cfg.fechamento)

  // dia aberto: hoje se estiver no mês; senão o dia 1
  const [selected, setSelected] = useState<ISODate>(today.slice(0, 7) === mes ? today : `${mes}-01`)
  useEffect(() => {
    setSelected((s) => (s.slice(0, 7) === mes ? s : today.slice(0, 7) === mes ? today : `${mes}-01`))
  }, [mes, today])

  const conv = (b: Bill) => convert(b.valorCents, b.moeda, display, settings.rates.perUSD)
  const all = [...byDay.values()].flat()
  const aPagar = all.filter((b) => b.status === 'pendente')
  const pagas = all.filter((b) => b.status === 'paga')
  const sum = (l: Bill[]) => l.reduce((s, b) => s + conv(b), 0)
  const day = byDay.get(selected) ?? []

  return (
    <div className="space-y-4">
      <MonthNav mes={mes} onChange={onMes} />

      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-0.5 !p-3">
          <p className="text-xs text-muted">A pagar em {monthLabel(mes).split(' ')[0]}</p>
          <p className="num text-base font-semibold">{formatMoney(sum(aPagar), display)}</p>
          <p className="text-[11px] text-muted">{aPagar.length} {aPagar.length === 1 ? 'conta' : 'contas'}</p>
        </Card>
        <Card className="space-y-0.5 !p-3">
          <p className="text-xs text-muted">Já pago</p>
          <p className="num text-base font-semibold">{formatMoney(sum(pagas), display)}</p>
          <p className="text-[11px] text-muted">{pagas.length} {pagas.length === 1 ? 'conta' : 'contas'}</p>
        </Card>
      </div>

      <div>
        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted">
          {WEEK.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d, i) => {
            if (!d) return <div key={`b${i}`} />
            const list = byDay.get(d) ?? []
            const pending = list.filter((b) => b.status === 'pendente')
            const late = pending.some((b) => b.vencimento < today)
            const isSel = d === selected
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                aria-pressed={isSel}
                aria-label={`${Number(d.slice(8))}: ${list.length ? `${list.length} ${list.length === 1 ? 'conta' : 'contas'}` : 'sem contas'}${d === fecha ? ', a fatura do cartão fecha' : ''}`}
                className={`relative flex h-[3.4rem] flex-col items-center justify-between rounded-lg border p-1 text-sm ${isSel ? 'border-accent bg-accent/15' : 'border-transparent bg-card'} ${d === today ? 'ring-1 ring-accent' : ''}`}
              >
                <span className={`font-medium ${d === today ? 'text-accent' : ''}`}>{Number(d.slice(8))}</span>
                <span className="flex h-2 items-center gap-0.5">
                  {list.slice(0, 3).map((b) => (
                    <span key={b.id} className={`h-1.5 w-1.5 rounded-full ${b.status === 'paga' ? 'bg-good' : b.vencimento < today ? 'bg-bad' : 'bg-accent'}`} />
                  ))}
                  {list.length > 3 && <span className="text-[8px] leading-none text-muted">+</span>}
                </span>
                <span className={`num h-3 text-[9px] leading-3 ${late ? 'text-bad' : 'text-muted'}`}>{pending.length ? compact.format(sum(pending) / 100) : ''}</span>
                {d === fecha && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-sm bg-warn" title="A fatura do cartão fecha" />}
              </button>
            )
          })}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" />a pagar</li>
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-bad" />atrasada</li>
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-good" />paga</li>
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-sm bg-warn" />fatura fecha (dia {cfg.fechamento})</li>
        </ul>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted first-letter:uppercase">
          {new Date(Date.UTC(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8, 10)))).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
          {selected === today ? ' · hoje' : ''}
        </h3>
        {selected === fecha && <p className="rounded-lg bg-raised px-3 py-2 text-xs text-muted">A fatura do cartão fecha hoje. Compras feitas depois entram na fatura do mês seguinte.</p>}
        {day.length === 0 ? (
          <Card className="border-dashed text-sm text-muted">Nenhuma conta neste dia.</Card>
        ) : (
          <ul className="space-y-2">
            {day.map((b) => (
              <BillRow key={b.id} b={b} today={today} onEdit={onEdit} />
            ))}
          </ul>
        )}
        <button onClick={() => onAdd(selected)} className="w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">
          + Adicionar conta neste dia
        </button>
      </section>
    </div>
  )
}
