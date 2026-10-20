import type { FormEvent, ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  canSubmit?: boolean
  children: ReactNode
  /** Ação destrutiva opcional (ex.: Excluir). */
  danger?: { label: string; onClick: () => void }[]
}

/** Painel que sobe de baixo: o formulário padrão de cadastro e edição. */
export function Sheet({ title, onClose, onSubmit, submitLabel = 'Salvar', canSubmit = true, children, danger }: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSubmit) onSubmit()
  }
  return (
    <div className="fade-in fixed inset-0 z-30 flex items-end bg-black/60 sm:items-center" onClick={onClose}>
      <form
        className="sheet-in mx-auto max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="mx-auto -mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <h2 className="font-semibold">{title}</h2>
        {children}
        <div className="flex items-center gap-2 pt-1">
          {danger?.map((d) => (
            <button key={d.label} type="button" onClick={d.onClick} className="rounded-lg px-2 py-3 text-sm font-medium text-bad">
              {d.label}
            </button>
          ))}
          <button type="button" onClick={onClose} className="ml-auto rounded-lg px-4 py-3 text-sm text-muted">
            Cancelar
          </button>
          <button type="submit" disabled={!canSubmit} className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-on-accent disabled:opacity-40">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

export const Fab = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-3xl leading-none text-on-accent shadow-lg shadow-black/30"
    style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
  >
    +
  </button>
)
