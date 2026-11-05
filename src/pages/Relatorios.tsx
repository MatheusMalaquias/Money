import { useMemo, useState } from 'react'
import { monthLabel, todayISO } from '../domain/dates'
import { formatMoney } from '../domain/money'
import { averageLeftover, categorySpend, evolution, monthlySeries, transactionsToCSV } from '../domain/reports'
import type { PersonId } from '../domain/types'
import { shareOrDownload } from '../services/files'
import { useApp } from '../state/data'
import { ColumnsChart, HBars, Legend, LineChart, SERIES } from '../ui/charts'
import { Card } from '../ui/Screen'

const MESES = 6

/** Relatórios dos últimos 6 meses até o mês escolhido no painel: gráficos, os mesmos números em tabela e exportação para planilha. */
export default function Relatorios({ mes, pessoa }: { mes: string; pessoa: PersonId | 'todos' }) {
  const { transactions, categories, settings } = useApp()
  const display = settings.moedaExibicao
  const [msg, setMsg] = useState('')
  const money = (c: number) => formatMoney(c, display)
  const args = { transactions, mes, meses: MESES, moeda: display, pessoa }
  const rows = useMemo(() => monthlySeries(args), [transactions, mes, display, pessoa]) // eslint-disable-line react-hooks/exhaustive-deps
  const evo = useMemo(() => evolution(args), [transactions, mes, display, pessoa]) // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => categorySpend(args), [transactions, mes, display, pessoa]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = rows.filter((r) => r.gastos > 0 || r.recebido > 0 || r.dizimo > 0)
  const gastoMedio = active.length ? Math.round(active.reduce((s, r) => s + r.gastos, 0) / active.length) : null
  const sobraMedia = averageLeftover(rows)
  const totalGasto = cats.reduce((s, c) => s + c.total, 0)
  const vazio = active.length === 0 && evo.every((e) => e.total === 0 && e.reserva === 0)

  const exportCsv = async () => {
    const csv = transactionsToCSV(transactions, categories, settings)
    const file = new File([csv], `money-lancamentos-${todayISO()}.csv`, { type: 'text/csv' })
    if (await shareOrDownload(file)) setMsg(`Planilha pronta: ${transactions.length} lançamentos.`)
  }

  if (vazio)
    return (
      <Card className="border-dashed text-sm text-muted">
        Ainda não há lançamentos nos últimos {MESES} meses. Quando houver, os gráficos de entradas, gastos e evolução aparecem aqui.
      </Card>
    )

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Últimos {MESES} meses, até {monthLabel(mes)}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Gasto médio por mês" value={gastoMedio === null ? '—' : money(gastoMedio)} note="sem o dízimo" />
        <Tile label="Sobra média por mês" value={sobraMedia === null ? '—' : money(sobraMedia)} note="depois do dízimo e dos gastos" negative={sobraMedia !== null && sobraMedia < 0} />
      </div>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Recebido e gasto por mês</h3>
        <Legend series={[{ name: 'Recebido', color: SERIES[0] }, { name: 'Gastos (sem o dízimo)', color: SERIES[1] }]} />
        <ColumnsChart
          rows={rows.map((r) => ({ mes: r.mes, values: [r.recebido, r.gastos] }))}
          series={[{ name: 'Recebido', color: SERIES[0] }, { name: 'Gastos', color: SERIES[1] }]}
          money={money}
          label="Gráfico de colunas: recebido e gasto em cada um dos últimos 6 meses"
        />
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Quanto temos, mês a mês</h3>
        <Legend series={[{ name: 'Total que temos', color: SERIES[0] }, { name: 'Reserva', color: SERIES[1] }]} />
        <LineChart
          rows={evo.map((e) => ({ mes: e.mes, values: [e.total, e.reserva] }))}
          series={[{ name: 'Total', color: SERIES[0] }, { name: 'Reserva', color: SERIES[1] }]}
          money={money}
          label="Gráfico de linhas: o total e a reserva no fim de cada um dos últimos 6 meses"
        />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Para onde foi o dinheiro</h3>
        {cats.length === 0 ? (
          <p className="text-sm text-muted">Sem gastos no período.</p>
        ) : (
          <HBars rows={cats.map((c) => ({ label: categories.find((x) => x.id === c.categoriaId)?.nome ?? '—', value: c.total }))} money={money} total={totalGasto} />
        )}
      </Card>

      <Card className="space-y-2">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Ver os números em tabela</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="num w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">Mês</th>
                  <th className="px-1 text-right font-medium">Recebido</th>
                  <th className="px-1 text-right font-medium">Dízimo</th>
                  <th className="px-1 text-right font-medium">Gastos</th>
                  <th className="pl-1 text-right font-medium">Sobra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.mes}>
                    <td className="py-1.5 capitalize">{monthLabel(r.mes).slice(0, 3)}</td>
                    <td className="px-1 text-right">{money(r.recebido)}</td>
                    <td className="px-1 text-right">{money(r.dizimo)}</td>
                    <td className="px-1 text-right">{money(r.gastos)}</td>
                    <td className={`pl-1 text-right font-semibold ${r.sobra < 0 ? 'text-bad' : ''}`}>{money(r.sobra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <table className="num mt-4 w-full text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Mês</th>
                <th className="px-1 text-right font-medium">Total</th>
                <th className="pl-1 text-right font-medium">Reserva</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {evo.map((e) => (
                <tr key={e.mes}>
                  <td className="py-1.5 capitalize">{monthLabel(e.mes).slice(0, 3)}</td>
                  <td className="px-1 text-right">{money(e.total)}</td>
                  <td className="pl-1 text-right">{money(e.reserva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Exportar</h3>
        <p className="text-xs text-muted">Todos os lançamentos (entradas, saídas, dízimo e reserva) em uma planilha CSV, que abre no Excel ou no Google Planilhas.</p>
        <button onClick={() => void exportCsv()} className="w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">
          Exportar planilha (CSV)
        </button>
        {msg && <p role="status" className="text-xs text-good">{msg}</p>}
      </Card>
    </div>
  )
}

/** Número de destaque: valor em algarismos proporcionais (grande, sem alinhamento em coluna). */
const Tile = ({ label, value, note, negative }: { label: string; value: string; note: string; negative?: boolean }) => (
  <div className="rounded-xl border border-line bg-card p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={`mt-1 break-words text-lg font-semibold leading-tight ${negative ? 'text-bad' : ''}`}>{value}</p>
    <p className="mt-0.5 text-[11px] text-muted">{note}</p>
  </div>
)
