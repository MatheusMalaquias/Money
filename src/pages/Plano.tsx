import { useState } from 'react'
import { planGoal } from '../domain/goals'
import { toBR, todayISO } from '../domain/dates'
import { centsToInput, convert, formatMoney, parseAmount } from '../domain/money'
import type { Currency, Goal, PersonId } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, PersonFilter, Segmented, inputCls, peopleOptions, personName } from '../ui/fields'
import { Card, Screen } from '../ui/Screen'
import { Fab, Sheet } from '../ui/Sheet'

interface Props {
  pessoa: PersonId | 'todos'
  onPessoa: (p: PersonId | 'todos') => void
}

export default function Plano({ pessoa, onPessoa }: Props) {
  const { goals, settings } = useApp()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [depositing, setDepositing] = useState<Goal | null>(null)
  const today = todayISO()
  const display = settings.moedaExibicao
  const toDisplay = (cents: number, from: Currency) => convert(cents, from, display, settings.rates.perUSD)

  const list = goals
    .filter((g) => pessoa === 'todos' || g.pessoa === pessoa)
    .map((g) => ({ g, p: planGoal(g, today) }))
    .sort((a, b) => (a.g.prazo ?? '9').localeCompare(b.g.prazo ?? '9'))
  const open = list.filter((x) => x.p.status !== 'concluida')
  // soma o que precisa ser guardado por mês em todas as metas abertas, na moeda dos totais
  const totalPerMonth = open.reduce((sum, { g, p }) => sum + toDisplay(p.status === 'atrasada' ? 0 : p.porMesCents ?? 0, g.moeda), 0)

  return (
    <Screen title="Plano e metas" subtitle="Quanto guardar para chegar lá">
      <PersonFilter settings={settings} value={pessoa} onChange={onPessoa} />

      {open.length > 0 && (
        <Card className="space-y-1">
          <p className="text-xs font-medium text-muted">Para cumprir {open.length === 1 ? 'a meta' : `as ${open.length} metas`} no prazo</p>
          <p className="num text-3xl font-bold tracking-tight">
            {formatMoney(totalPerMonth, display)} <span className="text-base font-medium text-muted">por mês</span>
          </p>
        </Card>
      )}

      {list.length === 0 ? (
        <Card className="space-y-2 border-dashed text-sm text-muted">
          <p>Nenhuma meta ainda. Defina quanto querem alcançar e até quando: o app mostra quanto guardar por mês.</p>
          <p>Ex.: reserva para a mudança para a Europa, passagens, entrada de um apartamento.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map(({ g, p }) => (
            <li key={g.id}>
              <Card className="space-y-3">
                <button onClick={() => setEditing(g)} className="block w-full space-y-1 text-left">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{g.nome}</span>
                    <span className="shrink-0 text-xs text-muted">{personName(settings, g.pessoa)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(p.progresso * 100)}%` }} />
                  </div>
                  <div className="num flex justify-between text-xs text-muted">
                    <span>
                      {formatMoney(g.atualCents, g.moeda)} de {formatMoney(g.alvoCents, g.moeda)}
                    </span>
                    <span>{Math.round(p.progresso * 100)}%</span>
                  </div>
                </button>

                {p.status === 'concluida' && <p className="text-sm font-medium text-good">Meta alcançada 🎉</p>}
                {p.status === 'atrasada' && (
                  <p className="text-sm text-bad">
                    Prazo de {toBR(g.prazo!)} passou. Faltam {formatMoney(p.restanteCents, g.moeda)}: edite a data para recalcular.
                  </p>
                )}
                {p.status === 'andamento' && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted">
                      Faltam {formatMoney(p.restanteCents, g.moeda)} até {g.prazo ? toBR(g.prazo) : '—'}
                      {g.prazo && ` · ${p.meses > 0 ? `${p.meses} ${p.meses === 1 ? 'mês' : 'meses'}` : 'último mês'}`}
                    </p>
                    {p.porMesCents !== null && (
                      <p className="num text-lg font-bold">
                        {formatMoney(p.porMesCents, g.moeda)} <span className="text-sm font-medium text-muted">por mês</span>
                        {g.moeda !== display && <span className="block text-xs font-normal text-muted">≈ {formatMoney(toDisplay(p.porMesCents, g.moeda), display)} por mês</span>}
                      </p>
                    )}
                  </div>
                )}

                <button onClick={() => setDepositing(g)} className="w-full rounded-lg border border-line py-2.5 text-sm font-medium text-accent">
                  Guardei / retirei valor
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Fab onClick={() => setEditing('new')} label="Nova meta" />
      {editing && <GoalSheet goal={editing === 'new' ? null : editing} defaultPessoa={pessoa === 'todos' ? 'casal' : pessoa} onClose={() => setEditing(null)} />}
      {depositing && <DepositSheet goal={depositing} onClose={() => setDepositing(null)} />}
    </Screen>
  )
}

function GoalSheet({ goal, defaultPessoa, onClose }: { goal: Goal | null; defaultPessoa: PersonId; onClose: () => void }) {
  const { settings, saveGoal, removeGoal } = useApp()
  const [nome, setNome] = useState(goal?.nome ?? '')
  const [alvo, setAlvo] = useState(goal ? centsToInput(goal.alvoCents) : '')
  const [moeda, setMoeda] = useState<Currency>(goal?.moeda ?? settings.moedaExibicao)
  const [atual, setAtual] = useState(goal && goal.atualCents ? centsToInput(goal.atualCents) : '')
  const [prazo, setPrazo] = useState(goal?.prazo ?? '')
  const [pessoa, setPessoa] = useState<PersonId>(goal?.pessoa ?? defaultPessoa)
  const alvoCents = parseAmount(alvo)
  const atualCents = atual.trim() === '' ? 0 : parseAmount(atual)
  const valid = nome.trim().length > 0 && alvoCents !== null && alvoCents > 0 && atualCents !== null && !!prazo

  const save = async () => {
    const now = nowISO()
    await saveGoal({ ...(goal ?? { id: newId(), createdAt: now }), nome: nome.trim(), alvoCents: alvoCents!, atualCents: atualCents!, moeda, prazo, pessoa, updatedAt: now })
    onClose()
  }

  return (
    <Sheet title={goal ? 'Editar meta' : 'Nova meta'} onClose={onClose} onSubmit={save} canSubmit={valid} danger={goal ? { label: 'Excluir', onClick: async () => { await removeGoal(goal.id); onClose() } } : undefined}>
      <Field label="Nome da meta">
        <input autoFocus={!goal} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mudança para a Europa" className={inputCls} />
      </Field>
      <Field label="Quanto querem alcançar">
        <AmountInput amount={alvo} currency={moeda} onAmount={setAlvo} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={alvoCents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Até quando">
          <input type="date" value={prazo} min={todayISO()} onChange={(e) => setPrazo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Quem">
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={inputCls}>
            {peopleOptions(settings).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
      </div>
      <Field label={`Já guardado (em ${moeda}, opcional)`}>
        <input inputMode="decimal" value={atual} onChange={(e) => setAtual(e.target.value)} placeholder="0,00" className={`${inputCls} num`} />
      </Field>
    </Sheet>
  )
}

/** Soma ou subtrai do valor guardado. Aceita outra moeda: converte para a moeda da meta pela cotação atual. */
function DepositSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { settings, saveGoal } = useApp()
  const [mode, setMode] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [moeda, setMoeda] = useState<Currency>(goal.moeda)
  const cents = parseAmount(amount)
  const inGoalCurrency = cents === null ? null : convert(cents, moeda, goal.moeda, settings.rates.perUSD)

  const save = async () => {
    const delta = mode === 'in' ? inGoalCurrency! : -inGoalCurrency!
    await saveGoal({ ...goal, atualCents: Math.max(0, goal.atualCents + delta), updatedAt: nowISO() })
    onClose()
  }

  return (
    <Sheet title={`Valor guardado · ${goal.nome}`} onClose={onClose} onSubmit={save} canSubmit={cents !== null && cents > 0} submitLabel="Confirmar">
      <Segmented label="Operação" value={mode} onChange={setMode} options={[{ value: 'in', label: 'Guardei' }, { value: 'out', label: 'Retirei' }]} />
      <Field label="Valor">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={goal.moeda} rates={settings.rates} />
      <p className="text-xs text-muted">Hoje: {formatMoney(goal.atualCents, goal.moeda)} guardados.</p>
    </Sheet>
  )
}
