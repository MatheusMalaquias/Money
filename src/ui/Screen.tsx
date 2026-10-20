import type { ReactNode } from 'react'
import { Logo } from './Logo'

/** Cabeçalho + conteúdo padrão de cada aba. */
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Logo size={40} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </div>
  )
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-line bg-card p-4 ${className}`}>{children}</div>
)
