import type { ThemePref } from '../theme'
import { Card, Screen } from '../ui/Screen'

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
]

export default function Config({ theme, onTheme }: { theme: ThemePref; onTheme: (t: ThemePref) => void }) {
  return (
    <Screen title="Ajustes" subtitle="Aparência, moedas, câmbio e backup">
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">Tema</h2>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-lg bg-raised p-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={theme === o.value}
              onClick={() => onTheme(o.value)}
              className={`rounded-md py-2 text-sm font-medium ${theme === o.value ? 'bg-accent text-on-accent' : 'text-muted'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>
      <Card className="border-dashed text-sm text-muted">Moedas, câmbio e backup JSON entram nas próximas etapas.</Card>
    </Screen>
  )
}
