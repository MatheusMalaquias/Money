import { useMemo } from 'react'
import { toBR } from '../domain/dates'
import { formatMoney } from '../domain/money'
import { summarizeTithe } from '../domain/tithe'
import { CURRENCIES, type PersonId } from '../domain/types'
import { useApp } from '../state/data'
import { personName } from '../ui/fields'
import { Card } from '../ui/Screen'

/** Dízimo do mês: total, quanto cada um separou, o ano e cada lançamento. Segue o filtro de pessoa do painel. */
export default function Dizimo({ mes, pessoa }: { mes: string; pessoa: PersonId | 'todos' }) {
  const { transactions, settings } = useApp()
  const display = settings.moedaExibicao
  const s = useMemo(() => summarizeTithe({ mes, transactions, moeda: display, pessoa }), [mes, transactions, display, pessoa])
  const pct = (settings.dizimoBps ?? 1000) / 100
  const others = CURRENCIES.filter((c) => c !== display && s.porMoeda[c] > 0)

  return (
    <div className="space-y-5">
      <Card className="space-y-1">
        <p className="text-xs font-medium text-muted">Dízimo do mês{pessoa !== 'todos' ? ` · ${personName(settings, pessoa)}` : ''}</p>
        <p className="num text-3xl font-bold tracking-tight">{formatMoney(s.total, display)}</p>
        <p className="num text-xs text-muted">
          {s.base > 0 ? `sobre ${formatMoney(s.base, display)} de entradas (${pct}%)` : `${pct}% das entradas do mês`}
        </p>
      </Card>

      {pessoa === 'todos' && s.porPessoa.length > 0 && (
        <Card className="divide-y divide-line py-1">
          {s.porPessoa.map((p) => (
            <div key={p.pessoa} className="flex items-baseline justify-between py-2.5">
              <span className="text-sm text-muted">{personName(settings, p.pessoa)}</span>
              <span className="num text-base font-semibold">{formatMoney(p.total, display)}</span>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">No ano de {mes.slice(0, 4)}</span>
          <span className="num text-base font-semibold">{formatMoney(s.ano, display)}</span>
        </div>
        {others.length > 0 && (
          <div className="num flex flex-wrap gap-x-4 text-xs text-muted">
            {[display, ...others].map((c) => (
              <span key={c}>{formatMoney(s.porMoeda[c], c)}</span>
            ))}
            <span>(valores originais do mês)</span>
          </div>
        )}
      </Card>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted">Lançamentos do dízimo</h3>
        {s.itens.length === 0 ? (
          <Card className="border-dashed text-sm text-muted">Nenhum dízimo neste mês. Ele aparece aqui quando uma entrada é lançada com "Descontar dízimo" marcado.</Card>
        ) : (
          <ul className="space-y-2">
            {s.itens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.descricao}</span>
                  <span className="block truncate text-xs text-muted">
                    {toBR(t.data)} · {personName(settings, t.pessoa)}
                  </span>
                </span>
                <span className="num shrink-0 text-sm font-semibold">{formatMoney(t.valorCents, t.moeda)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
