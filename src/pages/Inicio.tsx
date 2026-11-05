import { useMemo } from 'react'
import { buildAlerts, type Alert, type AlertLevel, type AlertTarget } from '../domain/alerts'
import { averageMonthlySpend, endOfMonth, summarizeBillsDue, summarizeTotals } from '../domain/balance'
import { dueLabel, sortBills } from '../domain/bills'
import { addDays, diffDays, monthKey, monthLabel, todayISO } from '../domain/dates'
import { monthlyNeed, planGoal } from '../domain/goals'
import { convert, formatMoney } from '../domain/money'
import { isStale } from '../domain/rates'
import { averageLeftover, monthlySeries } from '../domain/reports'
import { useApp } from '../state/data'
import { Card, Screen } from '../ui/Screen'

const LEVEL_UI: Record<AlertLevel, { mark: string; label: string; cls: string }> = {
  critico: { mark: '!', label: 'Urgente', cls: 'bg-bad/15 text-bad' },
  atencao: { mark: '▲', label: 'Atenção', cls: 'bg-warn/15 text-warn' },
  info: { mark: 'i', label: 'Aviso', cls: 'bg-raised text-muted' },
}
/** O número de destaque encolhe só quando o valor é grande demais para caber na tela do celular. */
const heroSize = (text: string) => (text.length > 15 ? 'text-3xl' : text.length > 12 ? 'text-4xl' : 'text-5xl')
const URGENCY_CLS = { paga: 'text-muted', atrasada: 'text-bad font-medium', urgente: 'text-warn font-medium', normal: 'text-muted' } as const

/** Visão de administrador: quanto temos, o que pede atenção, quanto precisamos guardar e o que vence logo. */
export default function Inicio({ onGo }: { onGo: (to: AlertTarget) => void }) {
  const { transactions, bills, goals, settings } = useApp()
  const display = settings.moedaExibicao
  const hoje = todayISO()
  const mes = monthKey(hoje)
  const money = (c: number) => formatMoney(c, display)
  const rates = settings.rates

  const v = useMemo(() => {
    const totals = summarizeTotals({ transactions, ate: hoje, moeda: display, pessoa: 'todos' })
    const dueMonth = summarizeBillsDue({ bills, ate: endOfMonth(mes), hoje, moeda: display, rates: rates.perUSD, pessoa: 'todos' })
    const dueWeek = summarizeBillsDue({ bills, ate: addDays(hoje, 7), hoje, moeda: display, rates: rates.perUSD, pessoa: 'todos' })
    const need = monthlyNeed(goals, hoje, display, rates.perUSD)
    const last3 = monthlySeries({ transactions, mes, meses: 3, moeda: display, pessoa: 'todos' })
    const capacity = averageLeftover(last3)
    const gastoMedio = averageMonthlySpend({ transactions, mes, moeda: display, pessoa: 'todos' })
    const sobra = totals.total - dueMonth.total
    const mesesReserva = gastoMedio > 0 ? totals.reserva / gastoMedio : null
    const faltaGuardar = capacity !== null && need.count > 0 ? Math.max(0, need.total - capacity) : null
    const alerts = buildAlerts({
      atrasadas: dueMonth.vencidas,
      proximas: { count: dueWeek.count - dueWeek.vencidas.count, total: dueWeek.total - dueWeek.vencidas.total },
      sobra,
      mesesReserva,
      reserva: totals.reserva,
      metasAtrasadas: need.atrasadas,
      faltaGuardar,
      semEntradasNoMes: last3[last3.length - 1].recebido === 0,
      cambioDesatualizado: isStale(rates, hoje, diffDays),
      money,
    })
    return { totals, sobra, need, capacity, alerts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, bills, goals, display, rates, hoje])

  const proximas = sortBills(bills.filter((b) => b.status === 'pendente')).slice(0, 4)
  const metas = goals
    .map((g) => ({ g, p: planGoal(g, hoje) }))
    .filter((x) => x.p.status !== 'concluida')
    .sort((a, b) => (a.g.prazo ?? '9').localeCompare(b.g.prazo ?? '9'))
    .slice(0, 3)
  const noRitmo = v.capacity !== null && v.need.count > 0 && v.capacity >= v.need.total

  return (
    <Screen title="Início" subtitle={`${settings.pessoas[0].nome} e ${settings.pessoas[1].nome} · ${monthLabel(mes)}`}>
      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Quanto temos</p>
          <p className={`${heroSize(money(v.totals.total))} font-bold leading-none tracking-tight ${v.totals.total < 0 ? 'text-bad' : ''}`}>{money(v.totals.total)}</p>
          <p className="pt-1 text-xs text-muted">depois do dízimo e do que foi para a reserva</p>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-line pt-3">
          <button onClick={() => onGo('painel')} className="text-left">
            <p className="text-xs text-muted">Reserva</p>
            <p className="num text-base font-semibold">{money(v.totals.reserva)}</p>
          </button>
          <button onClick={() => onGo('painel')} className="text-left">
            <p className="text-xs text-muted">Sobra depois das contas</p>
            <p className={`num text-base font-semibold ${v.sobra < 0 ? 'text-bad' : ''}`}>{money(v.sobra)}</p>
          </button>
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">O que pede atenção</h2>
        {v.alerts.length === 0 ? (
          <Card className="flex items-center gap-3 text-sm">
            <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-good/15 text-good">✓</span>
            <span>
              <b className="font-semibold">Tudo em dia.</b> <span className="text-muted">Nenhuma conta atrasada e as contas do mês estão cobertas.</span>
            </span>
          </Card>
        ) : (
          <ul className="space-y-2">
            {v.alerts.map((a) => (
              <AlertRow key={a.id} a={a} onGo={onGo} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">Quanto precisamos guardar</h2>
        <Card className="space-y-3">
          {v.need.count === 0 ? (
            <p className="text-sm text-muted">Nenhuma meta com prazo ainda. Defina quanto querem alcançar e até quando, e o app mostra quanto guardar por mês.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-muted">Precisamos guardar por mês</dt>
                <dd className="num text-base font-semibold">{money(v.need.total)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-muted">Costuma sobrar por mês</dt>
                <dd className={`num text-base font-semibold ${v.capacity !== null && v.capacity < 0 ? 'text-bad' : ''}`}>{v.capacity === null ? '—' : money(v.capacity)}</dd>
              </div>
              <p className={`rounded-lg px-3 py-2 text-xs ${noRitmo ? 'bg-good/15 text-good' : 'bg-raised text-muted'}`}>
                {v.capacity === null
                  ? 'Ainda não há meses com entradas e gastos para comparar.'
                  : noRitmo
                    ? '✓ No ritmo: o que sobra por mês cobre o que precisam guardar.'
                    : `Faltam ${money(Math.max(0, v.need.total - v.capacity))} por mês para cumprir as metas no prazo.`}
              </p>
              <p className="text-[11px] text-muted">A média usa os últimos 3 meses (recebido − dízimo − gastos).</p>
            </dl>
          )}
          {metas.length > 0 && (
            <ul className="space-y-3 border-t border-line pt-3">
              {metas.map(({ g, p }) => (
                <li key={g.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{g.nome}</span>
                    <span className="num shrink-0 text-xs text-muted">{Math.round(p.progresso * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-r bg-raised"><div className="h-full rounded-r bg-accent" style={{ width: `${Math.round(p.progresso * 100)}%` }} /></div>
                  <p className="num text-xs text-muted">
                    {p.status === 'atrasada' ? 'Prazo vencido' : p.porMesCents !== null ? `${formatMoney(p.porMesCents, g.moeda)} por mês` : 'Sem prazo'}
                    {g.moeda !== display && p.porMesCents !== null && p.status !== 'atrasada' && ` (≈ ${money(convert(p.porMesCents, g.moeda, display, rates.perUSD))})`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => onGo('plano')} className="w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">{goals.length ? 'Ver metas' : 'Criar uma meta'}</button>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">Próximas contas</h2>
        {proximas.length === 0 ? (
          <Card className="border-dashed text-sm text-muted">Nenhuma conta pendente.</Card>
        ) : (
          <Card className="divide-y divide-line py-1">
            {proximas.map((b) => {
              const d = dueLabel(b, hoje)
              return (
                <button key={b.id} onClick={() => onGo('contas')} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.descricao}</span>
                    <span className={`block text-xs ${URGENCY_CLS[d.urgency]}`}>{d.text}</span>
                  </span>
                  <span className="num shrink-0 text-sm font-semibold">{formatMoney(b.valorCents, b.moeda)}</span>
                </button>
              )
            })}
          </Card>
        )}
      </section>
    </Screen>
  )
}

function AlertRow({ a, onGo }: { a: Alert; onGo: (to: AlertTarget) => void }) {
  const ui = LEVEL_UI[a.nivel]
  return (
    <li>
      <button onClick={() => onGo(a.destino)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left">
        {/* ícone + palavra: a cor nunca é o único sinal */}
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ui.cls}`} aria-hidden>{ui.mark}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">{ui.label}</span>
          <span className="block text-sm font-medium">{a.titulo}</span>
          {a.detalhe && <span className="num block text-xs text-muted">{a.detalhe}</span>}
        </span>
        <span aria-hidden className="text-muted">›</span>
      </button>
    </li>
  )
}
