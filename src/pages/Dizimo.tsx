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
  const s = useMemo(() => summarizeTithe({ mes, transactions, moeda: display, pessoa, bps: settings.dizimoBps }), [mes, transactions, display, pessoa, settings.dizimoBps])
  const pct = (settings.dizimoBps ?? 1000) / 100
  const others = CURRENCIES.filter((c) => c !== display && s.porMoeda[c] > 0)

  return (
    <div className="space-y-5">
      <Card className="space-y-1">
        <p className="text-xs font-medium text-muted">Dízimo do mês{pessoa !== 'todos' ? ` · ${personName(settings, pessoa)}` : ''}</p>
        <p className="num text-3xl font-bold tracking-tight">{formatMoney(s.total, display)}</p>
        {others.length > 0 && (
          <p className="num text-xs text-muted">
            Nas moedas originais: {[display, ...others].filter((c) => s.porMoeda[c] > 0).map((c) => formatMoney(s.porMoeda[c], c)).join(' · ')}
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold text-muted">A conta do mês</h3>
        <dl className="num space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Recebido (com dízimo)</dt><dd>{formatMoney(s.base, display)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Dízimo ({pct}%)</dt><dd>− {formatMoney(s.total, display)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Fica com vocês</dt><dd>{formatMoney(s.liquido, display)}</dd></div>
        </dl>
        {s.semDizimo.base > 0 && (
          <p className="num rounded-lg bg-raised px-3 py-2 text-xs text-muted">
            Há {formatMoney(s.semDizimo.base, display)} em entradas sem dízimo neste mês. Se entrassem, o dízimo seria de <b className="text-main">{formatMoney(s.semDizimo.seria, display)}</b>. Para incluir, abra a entrada em Lançar e marque "Descontar dízimo".
          </p>
        )}
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
