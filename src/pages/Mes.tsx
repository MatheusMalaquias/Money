import { useMemo, useState } from 'react'
import { diffDays, todayISO, toBR } from '../domain/dates'
import { formatMoney } from '../domain/money'
import { summarizeMonth } from '../domain/month'
import { pairRate, isStale } from '../domain/rates'
import { CURRENCIES, type PersonId } from '../domain/types'
import { useApp } from '../state/data'
import { PersonFilter, Segmented } from '../ui/fields'
import Dizimo from './Dizimo'
import { MonthNav } from '../ui/MonthNav'
import { Card, Screen } from '../ui/Screen'

interface Props {
  mes: string
  onMes: (m: string) => void
  pessoa: PersonId | 'todos'
  onPessoa: (p: PersonId | 'todos') => void
}

export default function Mes({ mes, onMes, pessoa, onPessoa }: Props) {
  const { transactions, bills, categories, settings, ratesStatus, refreshRates } = useApp()
  const [aba, setAba] = useState<'resumo' | 'dizimo'>('resumo')
  const display = settings.moedaExibicao
  const s = useMemo(
    () => summarizeMonth({ mes, transactions, bills, rates: settings.rates.perUSD, moeda: display, pessoa }),
    [mes, transactions, bills, settings.rates.perUSD, display, pessoa]
  )
  const max = s.porCategoria[0]?.total ?? 1
  const used = CURRENCIES.filter((c) => c !== display && Object.values(s.porMoeda[c]).some((v) => v !== 0))
  const stale = isStale(settings.rates, todayISO(), diffDays)
  const r = pairRate('USD', display, settings.rates.perUSD)

  return (
    <Screen title="Visão do mês" subtitle="Quanto entrou, saiu e falta pagar">
      <MonthNav mes={mes} onChange={onMes} />
      <PersonFilter settings={settings} value={pessoa} onChange={onPessoa} />
      <Segmented label="Painel" value={aba} onChange={setAba} options={[{ value: 'resumo', label: 'Resumo' }, { value: 'dizimo', label: 'Dízimo' }]} />

      {aba === 'dizimo' ? (
        <Dizimo mes={mes} pessoa={pessoa} />
      ) : (
        <>

      <Card className="space-y-1">
        <p className="text-xs font-medium text-muted">Saldo do mês</p>
        <p className={`num text-3xl font-bold tracking-tight ${s.saldo < 0 ? 'text-bad' : 'text-main'}`}>{formatMoney(s.saldo, display)}</p>
      </Card>

      <Card className="divide-y divide-line py-1">
        <Row label="Entradas" value={formatMoney(s.entradas, display)} cls="text-good" />
        <Row label="Saídas" value={formatMoney(s.saidas, display)} />
        {s.dizimo > 0 && <Row label="· dos quais dízimo" value={formatMoney(s.dizimo, display)} cls="text-muted !text-sm !font-medium" />}
        <Row label="Falta pagar no mês" value={formatMoney(s.faltaPagar, display)} cls={s.faltaPagar > 0 ? 'text-warn' : ''} />
      </Card>

      {used.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">Em cada moeda (valores originais)</h3>
          {[display, ...used].map((c) => (
            <div key={c} className="num flex items-baseline justify-between text-sm">
              <span className="font-medium">{c}</span>
              <span className="text-xs text-muted">
                <span className="text-good">+{formatMoney(s.porMoeda[c].entradas, c)}</span> · −{formatMoney(s.porMoeda[c].saidas, c)} · falta {formatMoney(s.porMoeda[c].faltaPagar, c)}
              </span>
            </div>
          ))}
        </Card>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted">Gastos por categoria</h3>
        {s.porCategoria.length === 0 ? (
          <Card className="border-dashed text-sm text-muted">Sem gastos neste mês.</Card>
        ) : (
          <Card className="space-y-3">
            {s.porCategoria.map((row) => {
              const c = categories.find((x) => x.id === row.categoriaId)
              return (
                <div key={row.categoriaId} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{c?.nome ?? '—'}</span>
                    <span className="num text-muted">
                      {formatMoney(row.total, display)} · {Math.round((row.total / s.saidas) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full" style={{ width: `${(row.total / max) * 100}%`, background: c?.cor ?? '#94a3b8' }} />
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </section>

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
    </Screen>
  )
}

const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex items-baseline justify-between py-2.5">
    <span className="text-sm text-muted">{label}</span>
    <span className={`num text-base font-semibold ${cls}`}>{value}</span>
  </div>
)
