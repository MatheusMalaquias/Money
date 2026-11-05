import { useId, useState, type ReactNode } from 'react'

/** Cores das séries (paleta validada para daltonismo e contraste, claro e escuro): azul e laranja. */
export const SERIES = ['rgb(var(--s1))', 'rgb(var(--s2))']

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const monthShort = (mes: string) =>
  new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1)).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')

/** Escala com números redondos (1, 2, 5 × 10ⁿ) que sempre inclui o zero. Valores em centavos. */
export function niceScale(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  const a = Math.min(0, min)
  const b = Math.max(0, max)
  const range = b - a || 100
  const rough = range / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const n = rough / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
  const lo = Math.floor(a / step) * step
  const hi = Math.ceil(b / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v)
  return { lo, hi, ticks }
}

export interface ChartSeries {
  name: string
  color: string
}
export interface ChartRow {
  /** "YYYY-MM" */
  mes: string
  values: number[]
}

const W = 340
const H = 190
const M = { left: 40, right: 8, top: 10, bottom: 26 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

/** Legenda: um quadrado da cor da série + o nome em texto neutro (a cor nunca pinta o texto). */
export function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, title, items, money }: { x: number; title: string; items: { name: string; color: string; value: number }[]; money: (c: number) => string }) {
  // mantém o balão dentro do cartão nas pontas do gráfico
  const pct = Math.min(78, Math.max(22, (x / W) * 100))
  return (
    <div role="status" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-lg shadow-black/10" style={{ left: `${pct}%` }}>
      <p className="mb-0.5 capitalize text-muted">{title}</p>
      {items.map((it) => (
        <p key={it.name} className="num flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-0.5 w-3 rounded" style={{ background: it.color }} />
          <b className="font-semibold">{money(it.value)}</b>
          <span className="text-muted">{it.name}</span>
        </p>
      ))}
    </div>
  )
}

function Frame({ children, label, tooltip }: { children: ReactNode; label: string; tooltip?: ReactNode }) {
  return (
    <div className="relative pt-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block w-full select-none">
        {children}
      </svg>
      {tooltip}
    </div>
  )
}

function Axes({ scale, y, months, xOf }: { scale: ReturnType<typeof niceScale>; y: (v: number) => number; months: string[]; xOf: (i: number) => number }) {
  return (
    <>
      {scale.ticks.map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" strokeWidth={v === 0 ? 1.5 : 1} />
          <text x={M.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--muted))">
            {v === 0 ? '0' : compact.format(v / 100)}
          </text>
        </g>
      ))}
      {months.map((m, i) => (
        <text key={m} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">
          {monthShort(m)}
        </text>
      ))}
    </>
  )
}

/** Colunas agrupadas por mês: uma coluna por série, finas (≤ 24px), ponta de cima arredondada e base reta. */
export function ColumnsChart({ rows, series, money, label }: { rows: ChartRow[]; series: ChartSeries[]; money: (c: number) => string; label: string }) {
  const [active, setActive] = useState<number | null>(null)
  const all = rows.flatMap((r) => r.values)
  const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all))
  const y = (v: number) => M.top + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * PH
  const group = PW / rows.length
  const xOf = (i: number) => M.left + group * i + group / 2
  const bw = Math.min(24, (group - 10) / series.length - 1)
  const total = bw * series.length + (series.length - 1) * 2 // 2px de ar entre colunas vizinhas
  return (
    <Frame
      label={label}
      tooltip={active !== null && <Tooltip x={xOf(active)} title={monthShort(rows[active].mes)} items={series.map((s, k) => ({ name: s.name, color: s.color, value: rows[active].values[k] }))} money={money} />}
    >
      <Axes scale={scale} y={y} months={rows.map((r) => r.mes)} xOf={xOf} />
      {rows.map((r, i) => (
        <g key={r.mes} opacity={active === null || active === i ? 1 : 0.55}>
          {active === i && <rect x={M.left + group * i + 2} y={M.top} width={group - 4} height={PH} rx={6} fill="rgb(var(--raised))" opacity={0.7} />}
          {r.values.map((v, k) => {
            const x0 = xOf(i) - total / 2 + k * (bw + 2)
            const top = y(Math.max(v, 0))
            const h = y(0) - top
            if (h <= 0) return null
            const rr = Math.min(4, h)
            return <path key={k} d={`M${x0},${y(0)} V${top + rr} Q${x0},${top} ${x0 + rr},${top} H${x0 + bw - rr} Q${x0 + bw},${top} ${x0 + bw},${top + rr} V${y(0)} Z`} fill={series[k].color} />
          })}
          {/* área de toque: o grupo inteiro, bem maior que as colunas */}
          <rect
            x={M.left + group * i}
            y={M.top}
            width={group}
            height={PH + M.bottom}
            fill="transparent"
            tabIndex={0}
            aria-label={`${monthShort(r.mes)}: ${series.map((s, k) => `${s.name} ${money(r.values[k])}`).join(', ')}`}
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)} /* no toque o balão fica até tocar fora (onBlur) */
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            style={{ outline: 'none' }}
          />
        </g>
      ))}
    </Frame>
  )
}

/** Linhas de 2px com ponto final de 8px e anel da cor do fundo; o toque mostra o valor de todas as séries naquele mês. */
export function LineChart({ rows, series, money, label }: { rows: ChartRow[]; series: ChartSeries[]; money: (c: number) => string; label: string }) {
  const [active, setActive] = useState<number | null>(null)
  const uid = useId()
  const all = rows.flatMap((r) => r.values)
  const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all))
  const y = (v: number) => M.top + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * PH
  const n = rows.length
  const xOf = (i: number) => (n === 1 ? M.left + PW / 2 : M.left + 8 + (i / (n - 1)) * (PW - 16))
  const zone = PW / n
  return (
    <Frame
      label={label}
      tooltip={active !== null && <Tooltip x={xOf(active)} title={monthShort(rows[active].mes)} items={series.map((s, k) => ({ name: s.name, color: s.color, value: rows[active].values[k] }))} money={money} />}
    >
      <Axes scale={scale} y={y} months={rows.map((r) => r.mes)} xOf={xOf} />
      {active !== null && <line x1={xOf(active)} x2={xOf(active)} y1={M.top} y2={M.top + PH} stroke="rgb(var(--muted))" strokeWidth={1} opacity={0.5} />}
      {series.map((s, k) => (
        <g key={s.name}>
          <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={rows.map((r, i) => `${xOf(i)},${y(r.values[k])}`).join(' ')} />
          {[n - 1, ...(active !== null && active !== n - 1 ? [active] : [])].map((i) => (
            <circle key={`${uid}${i}`} cx={xOf(i)} cy={y(rows[i].values[k])} r={4} fill={s.color} stroke="rgb(var(--card))" strokeWidth={2} />
          ))}
        </g>
      ))}
      {rows.map((r, i) => (
        <rect
          key={r.mes}
          x={xOf(i) - zone / 2}
          y={M.top}
          width={zone}
          height={PH + M.bottom}
          fill="transparent"
          tabIndex={0}
          aria-label={`${monthShort(r.mes)}: ${series.map((s, k) => `${s.name} ${money(r.values[k])}`).join(', ')}`}
          onPointerEnter={() => setActive(i)}
          onPointerDown={() => setActive(i)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)} /* no toque o balão fica até tocar fora (onBlur) */
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
          style={{ outline: 'none' }}
        />
      ))}
    </Frame>
  )
}

/** Barras horizontais de uma série só: todas na mesma cor, valor na ponta, ponta de dados arredondada e base reta. */
export function HBars({ rows, money, total }: { rows: { label: string; value: number }[]; money: (c: number) => string; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="num shrink-0 text-xs text-muted">
              <b className="font-semibold text-main">{money(r.value)}</b> · {Math.round((r.value / (total || 1)) * 100)}%
            </span>
          </div>
          <div className="h-2.5 rounded-r bg-raised">
            <div className="h-full rounded-r" style={{ width: `${(r.value / max) * 100}%`, background: SERIES[0] }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
