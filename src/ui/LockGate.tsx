import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createLock, loadLock, PIN_RE, saveLock, verifyPin, wipeEverything, type LockRecord } from '../lock'
import { inputCls } from './fields'
import { Logo } from './Logo'

interface LockApi {
  enabled: boolean
  lockNow(): void
  enable(pin: string): Promise<void>
  /** Devolve false se o PIN atual estiver errado (ou em espera). */
  disable(pin: string): Promise<boolean>
  change(current: string, next: string): Promise<boolean>
}

const Ctx = createContext<LockApi | null>(null)
export const useLock = (): LockApi => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLock fora do LockGate')
  return v
}

/** Depois de tanto tempo com o app em segundo plano (ou a tela apagada), o PIN volta a ser pedido. */
const AUTO_LOCK_MS = 60_000

/** Só mostra o app quando não há PIN ou ele foi digitado. Sem PIN configurado, é invisível. */
export default function LockGate({ children }: { children: ReactNode }) {
  const [rec, setRec] = useState<LockRecord | null>(loadLock)
  const [unlocked, setUnlocked] = useState(() => !loadLock())
  const hiddenAt = useRef<number | null>(null)

  const update = useCallback((r: LockRecord | null) => {
    saveLock(r)
    setRec(r)
  }, [])

  useEffect(() => {
    if (!rec) return
    const onChange = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hiddenAt.current !== null && Date.now() - hiddenAt.current > AUTO_LOCK_MS) {
        hiddenAt.current = null
        setUnlocked(false)
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [rec])

  const api = useMemo<LockApi>(
    () => ({
      enabled: !!rec,
      lockNow: () => setUnlocked(false),
      enable: async (pin) => update(await createLock(pin)),
      disable: async (pin) => {
        if (!rec) return true
        const v = await verifyPin(pin, rec)
        update(v.ok ? null : v.record)
        return v.ok
      },
      change: async (current, next) => {
        if (!rec) return false
        const v = await verifyPin(current, rec)
        if (!v.ok) {
          update(v.record)
          return false
        }
        update(await createLock(next))
        return true
      },
    }),
    [rec, update]
  )

  if (rec && !unlocked) return <LockScreen rec={rec} onRecord={update} onUnlock={() => setUnlocked(true)} />
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

function LockScreen({ rec, onRecord, onUnlock }: { rec: LockRecord; onRecord: (r: LockRecord) => void; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(() => Math.max(0, Math.ceil((rec.until - Date.now()) / 1000)))
  const [forgot, setForgot] = useState(false)
  const [confirm, setConfirm] = useState('')

  // contagem regressiva da espera depois de erros demais
  useEffect(() => {
    if (wait <= 0) return
    const t = setInterval(() => setWait(Math.max(0, Math.ceil((rec.until - Date.now()) / 1000))), 500)
    return () => clearInterval(t)
  }, [wait, rec.until])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || wait > 0 || !PIN_RE.test(pin)) return
    setBusy(true)
    const v = await verifyPin(pin, rec)
    onRecord(v.record)
    setBusy(false)
    if (v.ok) return onUnlock()
    setPin('')
    setWait(v.waitSeconds)
    setError(v.waitSeconds > 0 ? 'Muitas tentativas erradas.' : 'PIN incorreto.')
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6 px-6 safe-top">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={64} />
        <h1 className="text-2xl font-bold tracking-tight">Money</h1>
        <p className="text-sm text-muted">Digite o PIN para abrir</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''))
            setError('')
          }}
          aria-label="PIN"
          placeholder="••••"
          className={`${inputCls} num text-center text-2xl tracking-[0.5em]`}
        />
        <p role="alert" className="min-h-[1.25rem] text-center text-xs text-bad">
          {wait > 0 ? `${error || 'Aguarde'} Tente de novo em ${wait >= 60 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}.` : error}
        </p>
        <button type="submit" disabled={busy || wait > 0 || !PIN_RE.test(pin)} className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-40">
          Entrar
        </button>
      </form>

      {!forgot ? (
        <button onClick={() => setForgot(true)} className="text-xs text-muted underline">Esqueci o PIN</button>
      ) : (
        <div className="space-y-2 rounded-xl border border-bad/40 p-4 text-xs text-muted">
          <p>
            O PIN não pode ser recuperado. Para voltar a usar o app neste aparelho é preciso <b className="text-main">apagar os dados dele</b> (lançamentos, contas, metas). Se você tem um backup, dá para importar depois.
          </p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Digite ZERAR para confirmar" aria-label="Confirmação" autoCapitalize="characters" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setForgot(false); setConfirm('') }} className="rounded-lg border border-line py-2.5 text-sm">Cancelar</button>
            <button
              onClick={async () => {
                await wipeEverything()
                location.reload()
              }}
              disabled={confirm.trim().toUpperCase() !== 'ZERAR'}
              className="rounded-lg bg-bad py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Apagar e entrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
