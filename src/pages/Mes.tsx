import { useMemo, useState } from 'react'
import { endOfMonth, summarizeTotals } from '../domain/balance'
import { diffDays, monthLabel, todayISO, toBR } from '../domain/dates'
import { formatMoney } from '../domain/money'
import { isStale, pairRate } from '../domain/rates'
import { COUPLE, type PersonId } from '../domain/types'
import { useApp } from '../state/data'
import { PersonFilter, Segmented, personName } from '../ui/fields'
import { MonthNav } from '../ui/MonthNav'
import ReserveSheet from '../ui/ReserveSheet'
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
  const { transactions, settings, ratesStatus, refreshRates } = useApp()
  const [aba, setAba] = useState<Aba>('resumo')
  const [reserving, setReserving] = useState(false)
  const display = settings.moedaExibicao
  const t = useMemo(
    () => summarizeTotals({ transactions, ate: endOfMonth(mes), moeda: display, pessoa }),
    [transactions, mes, display, pessoa]
  )
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
              <p className="text-xs text-muted">depois do dízimo, somando tudo até o fim de {monthLabel(mes)}</p>
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
            <div className="num flex items-baseline justify-between border-t border-line pt-2 text-sm">
              <span className="text-muted">Disponível (total − reserva)</span>
              <span className={`font-semibold ${t.disponivel < 0 ? 'text-bad' : ''}`}>{formatMoney(t.disponivel, display)}</span>
            </div>
            <button onClick={() => setReserving(true)} className="w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">
              Guardar ou tirar da reserva
            </button>
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

      {reserving && <ReserveSheet tx={null} defaultPessoa={pessoa === 'todos' ? settings.pessoas[0].id : pessoa} onClose={() => setReserving(false)} />}
    </Screen>
  )
}
