import { addMonths, monthLabel } from '../domain/dates'

export function MonthNav({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  const btn = 'flex h-10 w-10 items-center justify-center rounded-full text-xl text-muted'
  return (
    <div className="flex items-center justify-between">
      <button onClick={() => onChange(addMonths(mes, -1))} aria-label="Mês anterior" className={btn}>‹</button>
      <h2 className="text-base font-semibold first-letter:uppercase">{monthLabel(mes)}</h2>
      <button onClick={() => onChange(addMonths(mes, 1))} aria-label="Próximo mês" className={btn}>›</button>
    </div>
  )
}
