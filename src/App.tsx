import { useState, type ReactNode } from 'react'
import { monthKey, todayISO } from './domain/dates'
import type { PersonId } from './domain/types'
import Config from './pages/Config'
import Contas from './pages/Contas'
import Lancar from './pages/Lancar'
import Mes from './pages/Mes'
import Placeholder from './pages/Placeholder'
import { DataProvider, useApp } from './state/data'
import { useTheme } from './theme'
import { IconBills, IconGear, IconMonth, IconPlan, IconSwap } from './ui/Icons'

type Tab = 'mes' | 'contas' | 'lancar' | 'plano' | 'ajustes'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'mes', label: 'Mês', icon: <IconMonth /> },
  { id: 'contas', label: 'Contas', icon: <IconBills /> },
  { id: 'lancar', label: 'Lançar', icon: <IconSwap /> },
  { id: 'plano', label: 'Plano', icon: <IconPlan /> },
  { id: 'ajustes', label: 'Ajustes', icon: <IconGear /> },
]

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

function Shell() {
  const { ready } = useApp()
  const [tab, setTab] = useState<Tab>('mes')
  const [theme, setTheme] = useTheme()
  // mês e pessoa escolhidos valem para as abas Mês, Lançar e Contas
  const [mes, setMes] = useState(() => monthKey(todayISO()))
  const [pessoa, setPessoa] = useState<PersonId | 'todos'>('todos')

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col">
      <main className="safe-top flex-1 px-4 pb-28">
        {!ready ? (
          <p className="pt-10 text-center text-sm text-muted">Carregando…</p>
        ) : (
          <>
            {tab === 'mes' && <Mes mes={mes} onMes={setMes} pessoa={pessoa} onPessoa={setPessoa} />}
            {tab === 'contas' && <Contas pessoa={pessoa} onPessoa={setPessoa} />}
            {tab === 'lancar' && <Lancar mes={mes} onMes={setMes} pessoa={pessoa} onPessoa={setPessoa} />}
            {tab === 'plano' && <Placeholder title="Plano e metas" next="Regras de distribuição da renda e metas, incluindo a mudança para a Europa." />}
            {tab === 'ajustes' && <Config theme={theme} onTheme={setTheme} />}
          </>
        )}
      </main>

      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur safe-bottom">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${tab === t.id ? 'text-accent' : 'text-muted'}`}
              >
                {t.icon}
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
