import { useMemo, useState } from 'react'
import { averageMonthlySpend, endOfMonth, summarizeBillsDue, summarizeTotals } from '../domain/balance'
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
              <p className={`num text-4xl font-bold tracking-tight ${t.total < 0 ? 'text-bad' : 'text-main'}`}>{formatMoney(t.total, display)}</p>
              <p className="text-xs text-muted">depois do dízimo e do que foi para a reserva, somando tudo até o fim de {monthLabel(mes)}</p>
            </div>

            {pessoa === 'todos' && t.porPessoa.length > 1 && (
              <div className="divide-y divide-line border-t border-line text-sm">
                {t.porPessoa
                  .sort((a, b) => b.total - a.total)
                  .map((p) => (
                    <div key={p.pessoa} className="num flex justify-between py-2">
                      <span className="text-muted">{p.pessoa === COUPLE ? 'Contas em comum' : personName(settings, p.pessoa)}</span>
                      <span className="font-medium">{formatMoney(p.total, display)}</span>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-muted">Reserva</h3>
              <span className="num text-lg font-bold">{formatMoney(t.reserva, display)}</span>
            </div>
            {mesesReserva !== null && t.reserva > 0 && (
              <p className="text-xs text-muted">Cobre cerca de {mesesReserva.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {Math.round(mesesReserva * 10) / 10 === 1 ? 'mês' : 'meses'} de gastos (média de {formatMoney(gastoMedio, display)} por mês).</p>
            )}
            <div className="num flex items-baseline justify-between border-t border-line pt-2 text-sm">
              <span className="text-muted">Tudo junto (total + reserva)</span>
              <span className="font-semibold">{formatMoney(t.junto, display)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setReserving('in')} className="rounded-lg bg-accent py-2.5 text-sm font-semibold text-on-accent">Guardar na reserva</button>
              <button onClick={() => setReserving('out')} className="rounded-lg border border-line py-2.5 text-sm font-medium text-accent">Tirar da reserva</button>
            </div>
            <button onClick={() => setReserving('add')} className="w-full text-xs text-muted underline">Informar o que a reserva já tinha</button>
          </Card>

          <Card className="space-y-2">
            <h3 className="text-sm font-semibold text-muted">Contas: já pagas e a pagar</h3>
            <dl className="num space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Débito · já pago em {monthLabel(mes)}</dt>
                <dd>{formatMoney(pagoNoMes, display)}</dd>
              </div>
              <p className="!mt-0 text-xs text-muted">Contas pagas e gastos do mês. Já estão descontados do total acima.</p>
              <div className="flex justify-between pt-1">
                <dt className="text-muted">Crédito · a pagar até o fim do mês{due.count > 0 ? ` (${due.count})` : ''}</dt>
                <dd className={due.vencidas.count > 0 ? 'text-bad' : ''}>− {formatMoney(due.total, display)}</dd>
              </div>
              {due.vencidas.count > 0 && (
                <div className="flex justify-between text-xs text-bad"><dt>· já vencidas ({due.vencidas.count})</dt><dd>{formatMoney(due.vencidas.total, display)}</dd></div>
              )}
              {dueAll.count > due.count && (
                <div className="flex justify-between text-xs text-muted"><dt>Todas as pendentes, com meses seguintes ({dueAll.count})</dt><dd>{formatMoney(dueAll.total, display)}</dd></div>
              )}
              <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Total que temos</dt><dd>{formatMoney(t.total, display)}</dd></div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Sobra depois do crédito</dt>
                <dd className={sobra < 0 ? 'text-bad' : 'text-good'}>{formatMoney(sobra, display)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">O crédito conta as contas pendentes que vencem até o fim de {monthLabel(mes)}, inclusive as atrasadas, pela cotação de hoje.</p>
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
