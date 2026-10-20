import type { ReactNode } from 'react'
import { convert, formatMoney } from '../domain/money'
import { pairRate } from '../domain/rates'
import { toBR } from '../domain/dates'
import { COUPLE, CURRENCIES, type Currency, type PersonId, type RatesState, type Settings } from '../domain/types'

const inputBase = 'rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent'
export const inputCls = `w-full ${inputBase}`

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-lg bg-raised p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md py-2 text-sm font-medium ${value === o.value ? 'bg-accent text-on-accent' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AmountInput({ amount, currency, onAmount, onCurrency }: { amount: string; currency: Currency; onAmount: (v: string) => void; onCurrency: (c: Currency) => void }) {
  return (
    <div className="flex gap-2">
      <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => onAmount(e.target.value)} aria-label="Valor" className={`${inputBase} num min-w-0 flex-1`} />
      <select value={currency} onChange={(e) => onCurrency(e.target.value as Currency)} aria-label="Moeda" className={`${inputBase} w-24 shrink-0`}>
        {CURRENCIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  )
}

/** "≈ R$ 5.045,30 · US$ 1 = R$ 5,05 (19/10/2026)": o salário em dólar já mostra quanto vale em reais. */
export function ConversionHint({ cents, from, to, rates }: { cents: number | null; from: Currency; to: Currency; rates: RatesState }) {
  if (cents === null || from === to) return null
  const r = pairRate(from, to, rates.perUSD)
  return (
    <p className="num text-xs text-muted">
      ≈ <b className="text-main">{formatMoney(convert(cents, from, to, rates.perUSD), to)}</b> · 1 {from} = {r.toFixed(4).replace('.', ',')} {to}
      {rates.date ? ` (${toBR(rates.date)})` : ' (câmbio aproximado: atualize em Ajustes)'}
    </p>
  )
}

export const peopleOptions = (s: Settings): { id: PersonId; nome: string }[] => [...s.pessoas, { id: COUPLE, nome: 'Casal' }]
export const personName = (s: Settings, id: PersonId) => peopleOptions(s).find((p) => p.id === id)?.nome ?? id

export function PersonFilter({ settings, value, onChange }: { settings: Settings; value: PersonId | 'todos'; onChange: (v: PersonId | 'todos') => void }) {
  const opts = [{ id: 'todos', nome: 'Todos' }, ...peopleOptions(settings)]
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${value === o.id ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line text-muted'}`}
        >
          {o.nome}
        </button>
      ))}
    </div>
  )
}
