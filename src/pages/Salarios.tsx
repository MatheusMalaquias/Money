import { useState } from 'react'
import { monthKey, toBR, todayISO } from '../domain/dates'
import { centsToInput, formatMoney, parseAmount } from '../domain/money'
import { nextSalaryDate } from '../domain/salary'
import { DEFAULT_TITHE_BPS, titheAmount } from '../domain/tithe'
import type { Currency, PersonId, Salary } from '../domain/types'
import { newId, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, inputCls, personName } from '../ui/fields'
import { Card } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'

/** Salários que se repetem: cada um vira uma entrada sozinha no dia combinado, já com o dízimo. */
export function SalaryCard() {
  const { settings } = useApp()
  const [editing, setEditing] = useState<Salary | 'new' | null>(null)
  const list = settings.salarios ?? []
  const hoje = todayISO()

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Salário todo mês</h3>
            <p className="text-xs text-muted">Entra sozinho no dia, já com o dízimo descontado.</p>
          </div>
          <button onClick={() => setEditing('new')} className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-accent">{list.length ? 'Adicionar' : 'Cadastrar'}</button>
        </div>
        {list.length > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((s) => {
              const next = nextSalaryDate(s, hoje)
              return (
                <li key={s.id}>
                  <button onClick={() => setEditing(s)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.descricao} · {personName(settings, s.pessoa)}</span>
                      <span className="block text-xs text-muted">{next ? `Próximo: ${toBR(next)}` : 'Encerrado'} · todo dia {s.dia}</span>
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-good">{formatMoney(s.valorCents, s.moeda)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {editing && <SalarySheet salary={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function SalarySheet({ salary, onClose }: { salary: Salary | null; onClose: () => void }) {
  const { settings, categories, updateSettings } = useApp()
  const trabalho = categories.find((c) => c.nome === 'Trabalho') ?? categories[0]
  const [descricao, setDescricao] = useState(salary?.descricao ?? 'Salário')
  const [amount, setAmount] = useState(salary ? centsToInput(salary.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(salary?.moeda ?? settings.moedaExibicao)
  const [pessoa, setPessoa] = useState<PersonId>(salary?.pessoa ?? settings.pessoas[0].id)
  const [dia, setDia] = useState(String(salary?.dia ?? 5))
  const [inicio, setInicio] = useState(salary?.inicio ?? monthKey(todayISO()))
  const [fim, setFim] = useState(salary?.fim ?? '')
  const [categoriaId, setCategoriaId] = useState(salary?.categoriaId ?? trabalho?.id ?? '')
  const [dizimo, setDizimo] = useState(salary ? salary.dizimo !== false : true)
  const bps = settings.dizimoBps ?? DEFAULT_TITHE_BPS
  const cents = parseAmount(amount)
  const diaN = Number(dia)
  const valid = cents !== null && cents > 0 && Number.isInteger(diaN) && diaN >= 1 && diaN <= 31 && /^\d{4}-\d{2}$/.test(inicio) && (!fim || fim >= inicio) && !!categoriaId && descricao.trim() !== ''
  const list = settings.salarios ?? []

  const save = async () => {
    const next: Salary = {
      id: salary?.id ?? newId(),
      descricao: descricao.trim(),
      valorCents: cents!,
      moeda,
      pessoa,
      categoriaId,
      dia: diaN,
      inicio,
      fim: fim || undefined,
      dizimo,
      puladas: salary?.puladas,
    }
    await updateSettings({ salarios: salary ? list.map((x) => (x.id === salary.id ? next : x)) : [...list, next] })
    onClose()
  }

  return (
    <Sheet
      title={salary ? 'Editar salário' : 'Novo salário'}
      onClose={onClose}
      onSubmit={save}
      canSubmit={valid}
      danger={salary ? [{ label: 'Excluir salário fixo', onClick: async () => { await updateSettings({ salarios: list.filter((x) => x.id !== salary.id) }); onClose() } }] : undefined}
    >
      <Field label="Descrição">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Valor recebido (antes do dízimo)">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quem recebe">
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={inputCls}>
            {settings.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
        <Field label="Dia do mês">
          <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="A partir de">
          <input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Até (opcional)">
          <input type="month" value={fim} onChange={(e) => setFim(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Categoria">
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>
      {bps > 0 && (
        <label className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2.5 text-sm">
          <input type="checkbox" checked={dizimo} onChange={(e) => setDizimo(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
          <span className="flex-1">
            Dízimo automático ({bps / 100}%)
            {dizimo && cents !== null && cents > 0 && <span className="num block text-xs text-muted">− {formatMoney(titheAmount(cents, bps), moeda)} por mês</span>}
          </span>
        </label>
      )}
      <p className="text-xs text-muted">
        Os meses desde “A partir de” já entram nos lançamentos. Mudar o valor vale para os próximos meses; o que já entrou não muda. Se apagar um mês, ele não volta.
      </p>
    </Sheet>
  )
}
