import { useMemo, useState } from 'react'
import { averageMonthlySpend, breakdownTotals, endOfMonth, summarizeBillsDue, summarizeTotals } from '../domain/balance'
import { summarizeMonth } from '../domain/month'
import { diffDays, monthLabel, todayISO, toBR } from '../domain/dates'
import { formatMoney } from '../domain/money'
import { isStale, pairRate } from '../domain/rates'
import { COUPLE, type PersonId } from '../domain/types'
import { useApp } from '../state/data'
import { PersonFilter, Segmented, personName } from '../ui/fields'
import { MonthNav } from '../ui/MonthNav'
import ReserveSheet, { type ReserveMode } from '../ui/ReserveSheet'
import { Card, Screen } from '../ui/Screen'
import Dizimo from './Dizimo'
import Historico from './Historico'

interface Props {
  mes: string
  onMes: (m: string) => void
  pessoa: PersonId | 'todos'
  onPessoa: (p: PersonId | 'todos') => void
}

type Aba = 'resumo' | 'historico' | 'dizimo'

export default function Mes({ mes, onMes, pessoa, onPessoa }: Props) {
  const { transactions, bills, settings, ratesStatus, refreshRates } = useApp()
  const [aba, setAba] = useState<Aba>('resumo')
  const [reserving, setReserving] = useState<ReserveMode | null>(null)
  const display = settings.moedaExibicao
  const t = useMemo(
    () => summarizeTotals({ transactions, ate: endOfMonth(mes), moeda: display, pessoa }),
    [transactions, mes, display, pessoa]
  )
  const parts = useMemo(() => breakdownTotals({ transactions, ate: endOfMonth(mes), moeda: display, pessoa }), [transactions, mes, display, pessoa])
  const due = useMemo(
    () => summarizeBillsDue({ bills, ate: endOfMonth(mes), hoje: todayISO(), moeda: display, rates: settings.rates.perUSD, pessoa }),
    [bills, mes, display, settings.rates.perUSD, pessoa]
  )
  // crédito total: todas as pendentes, inclusive de meses seguintes (como a fatura toda do cartão, com as parcelas futuras)
  const dueAll = useMemo(
    () => summarizeBillsDue({ bills, ate: '9999-12-31', hoje: todayISO(), moeda: display, rates: settings.rates.perUSD, pessoa }),
    [bills, display, settings.rates.perUSD, pessoa]
  )
  // débito: o que já foi pago no mês (contas pagas e gastos), já descontado do total
  const month = useMemo(
    () => summarizeMonth({ mes, transactions, bills, rates: settings.rates.perUSD, moeda: display, pessoa }),
    [mes, transactions, bills, settings.rates.perUSD, display, pessoa]
  )
  const pagoNoMes = month.saidas - month.dizimo
  const gastoMedio = useMemo(() => averageMonthlySpend({ transactions, mes, moeda: display, pessoa }), [transactions, mes, display, pessoa])
  const mesesReserva = gastoMedio > 0 ? t.reserva / gastoMedio : null
  const sobra = t.total - due.total
  const stale = isStale(settings.rates, todayISO(), diffDays)
  const r = pairRate('USD', display, settings.rates.perUSD)

  return (
    <Screen title="Painel" subtitle="Quanto temos, o que entrou e saiu">
      <MonthNav mes={mes} onChange={onMes} />
      <PersonFilter settings={settings} value={pessoa} onChange={onPessoa} />
      <Segmented
        label="Painel"
        value={aba}
        onChange={setAba}
        options={[{ value: 'resumo', label: 'Resumo' }, { value: 'historico', label: 'Histórico' }, { value: 'dizimo', label: 'Dízimo' }]}
      />

      {aba === 'dizimo' && <Dizimo mes={mes} pessoa={pessoa} />}
      {aba === 'historico' && <Historico mes={mes} pessoa={pessoa} />}
      {aba === 'resumo' && (
        <>
          <Card className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted">Total que temos{pessoa !== 'todos' ? ` · ${personName(settings, pessoa)}` : ''}</p>
              <p className={`num text-4xl font-bold tracking-tight ${t.total < 0 ? 'text-bad' : ''}`}>{formatMoney(t.total, display)}</p>
              <p className="text-xs text-muted">depois do dízimo e da reserva · até o fim de {monthLabel(mes)}</p>
            </div>
            {pessoa === 'todos' && t.porPessoa.length > 1 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3">
                {[...t.porPessoa]
                  .sort((a, b) => b.total - a.total)
                  .map((p) => (
                    <div key={p.pessoa}>
                      <p className="text-xs text-muted">{p.pessoa === COUPLE ? 'Em comum' : personName(settings, p.pessoa)}</p>
                      <p className={`num text-sm font-semibold ${p.total < 0 ? 'text-bad' : ''}`}>{formatMoney(p.total, display)}</p>
                    </div>
                  ))}
              </div>
            )}
            <details className="border-t border-line pt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-accent">Como chegamos nesse total?</summary>
              <dl className="num mt-2 space-y-1.5">
                <div className="flex justify-between"><dt className="text-muted">Recebido</dt><dd className="text-good">+ {formatMoney(parts.recebido, display)}</dd></div>
                {parts.dizimo > 0 && <div className="flex justify-between"><dt className="text-muted">Dízimo</dt><dd>− {formatMoney(parts.dizimo, display)}</dd></div>}
                <div className="flex justify-between"><dt className="text-muted">Contas pagas e gastos</dt><dd>− {formatMoney(parts.pago, display)}</dd></div>
                {parts.guardado > 0 && <div className="flex justify-between"><dt className="text-muted">Guardado na reserva</dt><dd>− {formatMoney(parts.guardado, display)}</dd></div>}
                {parts.retirado > 0 && <div className="flex justify-between"><dt className="text-muted">Tirado da reserva</dt><dd>+ {formatMoney(parts.retirado, display)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Total</dt><dd className={t.total < 0 ? 'text-bad' : ''}>{formatMoney(t.total, display)}</dd></div>
              </dl>
              {parts.recebido === 0 && parts.pago > 0 && (
                <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-xs text-muted">Ainda não há nenhuma entrada lançada: o total é só o que já foi pago. Lance os salários em Lançar → Entrada.</p>
              )}
              {parts.entradasFuturas > 0 && (
                <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-xs text-muted">Há {formatMoney(parts.entradasFuturas, display)} em entradas com data depois de {monthLabel(mes)}. Elas só contam a partir do mês delas.</p>
              )}
            </details>
          </Card>

          <Card className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-muted">Reserva</h3>
              <span className="num text-xl font-bold">{formatMoney(t.reserva, display)}</span>
            </div>
            <p className="num text-xs text-muted">
              Tudo junto: {formatMoney(t.junto, display)}
              {mesesReserva !== null && t.reserva > 0 && ` · cobre ${mesesReserva.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${Math.round(mesesReserva * 10) / 10 === 1 ? 'mês' : 'meses'} de gastos`}
            </p>
            <button onClick={() => setReserving('in')} className="!mt-3 w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">
              Guardar, tirar ou informar saldo
            </button>
          </Card>

          <Card className="space-y-2">
            <h3 className="text-sm font-semibold text-muted">Contas</h3>
            <dl className="num space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Já pago no mês</dt>
                <dd>{formatMoney(pagoNoMes, display)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">A pagar até o fim do mês{due.count > 0 ? ` (${due.count})` : ''}</dt>
                <dd className={due.vencidas.count > 0 ? 'text-bad' : ''}>− {formatMoney(due.total, display)}</dd>
              </div>
              {due.vencidas.count > 0 && (
                <div className="flex justify-between text-xs text-bad"><dt>· atrasadas ({due.vencidas.count})</dt><dd>{formatMoney(due.vencidas.total, display)}</dd></div>
              )}
              {dueAll.count > due.count && (
                <div className="flex justify-between text-xs text-muted"><dt>Todas as pendentes, com meses seguintes</dt><dd>{formatMoney(dueAll.total, display)}</dd></div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Sobra depois das contas</dt>
                <dd className={sobra < 0 ? 'text-bad' : 'text-good'}>{formatMoney(sobra, display)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">O que já foi pago está descontado do total. O "a pagar" inclui as atrasadas.</p>
          </Card>
        </>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="num">
          1 US$ = {formatMoney(Math.round(r * 100), display)} {settings.rates.date ? `· ${toBR(settings.rates.date)}` : '· aproximado'}
        </span>
        <button onClick={() => void refreshRates()} disabled={ratesStatus === 'loading'} className={`rounded-full border px-3 py-1 ${stale ? 'border-warn text-warn' : 'border-line'}`}>
          {ratesStatus === 'loading' ? 'Atualizando…' : ratesStatus === 'error' ? 'Sem conexão · tentar' : 'Atualizar câmbio'}
        </button>
      </div>

      {reserving && <ReserveSheet tx={null} initialMode={reserving} defaultPessoa={pessoa === 'todos' ? settings.pessoas[0].id : pessoa} onClose={() => setReserving(null)} />}
    </Screen>
  )
}
