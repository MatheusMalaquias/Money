import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Storage } from '../storage/types'
import { AuthScreen, HouseholdSetup, NewPasswordScreen, StatusScreen } from './AuthScreens'
import { bootCloud, wipeLocal, type CloudRuntime, type Household } from './boot'
import { cloudConfigured, getClient } from './client'
import type { SyncStatus } from './sync'

export interface CloudApi {
  configured: boolean
  email?: string
  household?: Household
  status: SyncStatus
  syncNow(): Promise<void>
  /** Envia o que estiver pendente e, se não houver pendência (ou a pessoa confirmar), apaga os dados do aparelho e sai. */
  signOut(): Promise<void>
  pending(): number
}

const IDLE: SyncStatus = { state: 'idle', pending: 0, lastSync: null }
const OFF: CloudApi = { configured: false, status: IDLE, syncNow: async () => {}, signOut: async () => {}, pending: () => 0 }
const Ctx = createContext<CloudApi>(OFF)
export const useCloud = () => useContext(Ctx)

interface Props {
  children: (ctx: { storage?: Storage; refreshKey: number }) => ReactNode
}

/**
 * Sem as chaves do Supabase: não faz nada e o app segue local.
 * Com elas: exige login, garante que a pessoa está num espaço do casal e só então abre o app, já sincronizado.
 */
export default function CloudGate({ children }: Props) {
  if (!cloudConfigured) return <>{children({ refreshKey: 0 })}</>
  return <Configured>{children}</Configured>
}

function Configured({ children }: Props) {
  const client = getClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)
  const [household, setHousehold] = useState<Household | null | undefined>(undefined)
  const [runtime, setRuntime] = useState<CloudRuntime | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState<SyncStatus>(IDLE)
  const [attempt, setAttempt] = useState(0)
  const disposeRef = useRef<(() => void) | null>(null)

  // sessão: restaurada do aparelho (funciona sem internet) e atualizada a cada login/saída
  useEffect(() => {
    void client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = client.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [client])

  const loadHousehold = useCallback(async () => {
    const { data, error } = await client.rpc('money_my_household')
    if (error) throw new Error(error.message)
    const row = (data as Household[] | null)?.[0]
    setHousehold(row ?? null)
  }, [client])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId || recovery) {
      setHousehold(undefined)
      return
    }
    let alive = true
    setBootError(null)
    loadHousehold().catch((e) => alive && setBootError(String((e as Error).message)))
    return () => {
      alive = false
    }
  }, [userId, recovery, loadHousehold, attempt])

  // com o espaço definido, liga o aparelho (primeira sincronização incluída)
  const hid = household?.id
  useEffect(() => {
    if (!household) return
    let alive = true
    setRuntime(null)
    setBootError(null)
    bootCloud(client, household, () => setRefreshKey((k) => k + 1), setStatus)
      .then((rt) => {
        if (!alive) return rt.dispose()
        disposeRef.current = rt.dispose
        setRuntime(rt)
      })
      .catch((e) => alive && setBootError(String((e as Error).message)))
    return () => {
      alive = false
      disposeRef.current?.()
      disposeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, hid, attempt])

  const signOut = useCallback(async () => {
    await runtime?.syncNow() // manda o que faltar antes de apagar daqui
    runtime?.dispose()
    await wipeLocal()
    await client.auth.signOut()
    location.reload()
  }, [client, runtime])

  const api = useMemo<CloudApi>(
    () => ({
      configured: true,
      email: session?.user.email,
      household: household ?? undefined,
      status,
      syncNow: runtime?.syncNow ?? (async () => {}),
      signOut,
      pending: () => status.pending,
    }),
    [session, household, status, runtime, signOut]
  )

  if (session === undefined) return <StatusScreen title="Money" text="Carregando…" />
  if (recovery) return <NewPasswordScreen onDone={() => setRecovery(false)} />
  if (!session) return <AuthScreen />

  const out = { label: 'Sair da conta', run: () => void client.auth.signOut() }
  if (bootError && !runtime)
    return <StatusScreen title="Não foi possível abrir" text="Confira a conexão com a internet. Seus dados na nuvem continuam seguros." action={[{ label: 'Tentar de novo', run: () => setAttempt((a) => a + 1) }, out]} />
  if (household === undefined) return <StatusScreen title="Money" text="Entrando…" />
  if (household === null) return <HouseholdSetup onDone={() => void loadHousehold()} onSignOut={() => void client.auth.signOut()} />
  if (!runtime) return <StatusScreen title="Sincronizando…" text="Buscando os dados de vocês" />

  return (
    <Ctx.Provider value={api}>
      {children({ storage: runtime.storage, refreshKey })}
    </Ctx.Provider>
  )
}
