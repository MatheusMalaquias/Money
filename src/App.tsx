import { useState, type ReactNode } from 'react'
import Config from './pages/Config'
import Placeholder from './pages/Placeholder'
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
  const [tab, setTab] = useState<Tab>('mes')
  const [theme, setTheme] = useTheme()

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col">
      <main className="safe-top flex-1 px-4 pb-24">
        {tab === 'mes' && <Placeholder title="Mês" next="Entradas, saídas, saldo e quanto falta pagar, por mês e por moeda." />}
        {tab === 'contas' && <Placeholder title="Contas a pagar" next="Vencimentos, recorrência e destaque das contas vencidas." />}
        {tab === 'lancar' && <Placeholder title="Lançamentos" next="Entradas e saídas em BRL, USD ou EUR, por pessoa." />}
        {tab === 'plano' && <Placeholder title="Plano e metas" next="Regras de distribuição da renda e metas, incluindo a mudança para a Europa." />}
        {tab === 'ajustes' && <Config theme={theme} onTheme={setTheme} />}
      </main>

      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur safe-bottom"
      >
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
