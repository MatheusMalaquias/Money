import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { payBill, unpayBill } from '../domain/bills'
import { todayISO, diffDays } from '../domain/dates'
import { defaultSettings, seedCategories } from '../domain/defaults'
import { buildTithe, DEFAULT_TITHE_BPS, titheAmount } from '../domain/tithe'
import { isStale, mergeFetched, setManual } from '../domain/rates'
import type { Bill, Category, Currency, Goal, PlanRule, Settings, Transaction } from '../domain/types'
import { fetchRates } from '../services/fx'
import { createIndexedDBStorage } from '../storage/indexeddb'
import { createMemoryStorage } from '../storage/memory'
import type { Snapshot, Storage } from '../storage/types'

/** randomUUID só existe em HTTPS/localhost; abrindo pelo IP da rede (teste no celular) usa getRandomValues, que funciona sempre. */
export const newId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // versão 4
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export const nowISO = () => new Date().toISOString()

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((i) => i.id === item.id) ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item]

/** O IndexedDB devolve por id: as categorias precisam voltar na ordem que o usuário vê. */
const byOrder = (l: Category[]) => [...l].sort((a, b) => a.ordem - b.ordem)

export interface AppData {
  ready: boolean
  /** false se o navegador bloqueou o IndexedDB (ex.: aba anônima): os dados somem ao fechar. */
  persistent: boolean
  settings: Settings
  categories: Category[]
  bills: Bill[]
  transactions: Transaction[]
  goals: Goal[]
  rules: PlanRule[]
  ratesStatus: 'idle' | 'loading' | 'error'
  saveTransaction(t: Transaction): Promise<void>
  removeTransaction(id: string): Promise<void>
  saveBill(b: Bill): Promise<void>
  removeBill(id: string): Promise<void>
  pay(id: string): Promise<void>
  unpay(id: string): Promise<void>
  saveGoal(g: Goal): Promise<void>
  removeGoal(id: string): Promise<void>
  saveCategory(c: Category): Promise<void>
  removeCategory(id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  refreshRates(): Promise<void>
  fixRate(currency: Currency, value: number | null): Promise<void>
  exportData(): Promise<Snapshot>
  /** Substitui todos os dados pelo conteúdo do backup. */
  importData(snap: Snapshot): Promise<void>
}

const Ctx = createContext<AppData | null>(null)
export const useApp = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp fora do DataProvider')
  return v
}

export function DataProvider({ children, storage: injected }: { children: ReactNode; storage?: Storage }) {
  const st = useRef<Storage | null>(null)
  const [ready, setReady] = useState(false)
  const [persistent, setPersistent] = useState(true)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [categories, setCategories] = useState<Category[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [rules, setRules] = useState<PlanRule[]>([])
  const [ratesStatus, setRatesStatus] = useState<AppData['ratesStatus']>('idle')

  // espelho do estado mais recente: as ações são assíncronas e não podem ler valores "velhos" do render
  const live = useRef({ settings, bills, transactions, categories })
  live.current = { settings, bills, transactions, categories }

  useEffect(() => {
    let alive = true
    ;(async () => {
      let storage: Storage
      try {
        storage = injected ?? (await createIndexedDBStorage())
      } catch {
        storage = createMemoryStorage()
        setPersistent(false)
      }
      st.current = storage
      let s = await storage.getSettings()
      let cats = await storage.getAll('categories')
      if (!s) {
        s = defaultSettings()
        await storage.saveSettings(s)
        cats = seedCategories(nowISO(), newId)
        await storage.putMany('categories', cats) // só na primeira execução
      }
      const [b, t, g, r] = await Promise.all([storage.getAll('bills'), storage.getAll('transactions'), storage.getAll('goals'), storage.getAll('rules')])
      if (!alive) return
      setSettings(s)
      setCategories(byOrder(cats))
      setBills(b)
      setTransactions(t)
      setGoals(g)
      setRules(r)
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [injected])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...live.current.settings, ...patch }
    live.current.settings = next
    setSettings(next)
    await st.current!.saveSettings(next)
  }, [])

  const refreshRates = useCallback(async () => {
    setRatesStatus('loading')
    try {
      const f = await fetchRates()
      await updateSettings({ rates: mergeFetched(live.current.settings.rates, f.perUSD, f.date) })
      setRatesStatus('idle')
    } catch {
      setRatesStatus('error') // offline ou API fora: segue com a última cotação guardada
    }
  }, [updateSettings])

  // ao abrir, atualiza o câmbio em segundo plano se estiver velho
  useEffect(() => {
    if (ready && isStale(live.current.settings.rates, todayISO(), diffDays) && navigator.onLine) void refreshRates()
  }, [ready, refreshRates])

  /** Acha a categoria Dízimo (mesmo renomeada) ou cria, para bases criadas antes dela existir. */
  const ensureTitheCategory = useCallback(async (): Promise<string> => {
    const found = live.current.categories.find((c) => c.chave === 'dizimo')
    if (found) return found.id
    const now = nowISO()
    const cat: Category = { id: newId(), createdAt: now, updatedAt: now, nome: 'Dízimo', cor: '#a78bfa', ordem: live.current.categories.length, chave: 'dizimo' }
    await st.current!.put('categories', cat)
    live.current.categories = [...live.current.categories, cat]
    setCategories((l) => byOrder(upsert(l, cat)))
    return cat.id
  }, [])

  /** Mantém a saída de dízimo coerente com a entrada: cria, atualiza ou remove. */
  const syncTithe = useCallback(
    async (income: Transaction) => {
      const existing = live.current.transactions.find((x) => x.dizimoDeId === income.id)
      const bps = live.current.settings.dizimoBps ?? DEFAULT_TITHE_BPS
      if (income.dizimo && titheAmount(income.valorCents, bps) > 0) {
        const d = buildTithe(income, { now: nowISO(), newId, categoriaId: await ensureTitheCategory(), bps, existing })
        await st.current!.put('transactions', d)
        setTransactions((l) => upsert(l, d))
      } else if (existing) {
        await st.current!.remove('transactions', existing.id)
        setTransactions((l) => l.filter((x) => x.id !== existing.id))
      }
    },
    [ensureTitheCategory]
  )

  const saveTransaction = useCallback(
    async (t: Transaction) => {
      await st.current!.put('transactions', t)
      setTransactions((l) => upsert(l, t))
      if (t.tipo === 'entrada') await syncTithe(t)
    },
    [syncTithe]
  )

  const saveBill = useCallback(async (b: Bill) => {
    await st.current!.put('bills', b)
    setBills((l) => upsert(l, b))
  }, [])

  const unpay = useCallback(async (id: string) => {
    const bill = live.current.bills.find((b) => b.id === id)
    if (!bill || bill.status !== 'paga') return
    const u = unpayBill(bill, live.current.bills, nowISO())
    await st.current!.put('bills', u.bill)
    if (u.removeTransactionId) await st.current!.remove('transactions', u.removeTransactionId)
    if (u.removeBillId) await st.current!.remove('bills', u.removeBillId)
    setBills((l) => upsert(l, u.bill).filter((b) => b.id !== u.removeBillId))
    setTransactions((l) => l.filter((t) => t.id !== u.removeTransactionId))
  }, [])

  const pay = useCallback(async (id: string) => {
    const bill = live.current.bills.find((b) => b.id === id)
    if (!bill || bill.status === 'paga') return
    const r = payBill(bill, { now: nowISO(), today: todayISO(), perUSD: live.current.settings.rates.perUSD, newId })
    await st.current!.putMany('bills', r.next ? [r.bill, r.next] : [r.bill])
    await st.current!.put('transactions', r.transaction)
    setBills((l) => (r.next ? upsert(upsert(l, r.bill), r.next) : upsert(l, r.bill)))
    setTransactions((l) => upsert(l, r.transaction))
  }, [])

  const removeTransaction = useCallback(
    async (id: string) => {
      const linked = live.current.bills.find((b) => b.transacaoId === id)
      if (linked) return unpay(linked.id) // lançamento gerado por uma conta: excluir = desfazer o pagamento
      // apagar uma entrada leva junto o dízimo que ela gerou
      const gone = new Set([id, ...live.current.transactions.filter((x) => x.dizimoDeId === id).map((x) => x.id)])
      for (const g of gone) await st.current!.remove('transactions', g)
      setTransactions((l) => l.filter((t) => !gone.has(t.id)))
    },
    [unpay]
  )

  const removeBill = useCallback(async (id: string) => {
    await st.current!.remove('bills', id)
    setBills((l) => l.filter((b) => b.id !== id))
  }, [])

  const saveGoal = useCallback(async (g: Goal) => {
    await st.current!.put('goals', g)
    setGoals((l) => upsert(l, g))
  }, [])

  const removeGoal = useCallback(async (id: string) => {
    await st.current!.remove('goals', id)
    setGoals((l) => l.filter((g) => g.id !== id))
  }, [])

  const saveCategory = useCallback(async (c: Category) => {
    await st.current!.put('categories', c)
    setCategories((l) => byOrder(upsert(l, c)))
  }, [])

  const removeCategory = useCallback(async (id: string) => {
    if (live.current.categories.find((c) => c.id === id)?.chave) throw new Error('Categoria do sistema')
    const used = live.current.bills.some((b) => b.categoriaId === id) || live.current.transactions.some((t) => t.categoriaId === id)
    if (used) throw new Error('Categoria em uso')
    await st.current!.remove('categories', id)
    setCategories((l) => l.filter((c) => c.id !== id))
  }, [])

  const fixRate = useCallback(
    async (currency: Currency, value: number | null) => {
      await updateSettings({ rates: setManual(live.current.settings.rates, currency, value) })
      if (value === null) await refreshRates() // voltou ao automático: busca já
    },
    [updateSettings, refreshRates]
  )

  const exportData = useCallback(() => st.current!.snapshot(), [])

  const importData = useCallback(async (snap: Snapshot) => {
    const settings = snap.settings ?? defaultSettings()
    await st.current!.restore({ ...snap, settings })
    live.current = { settings, bills: snap.data.bills, transactions: snap.data.transactions, categories: snap.data.categories }
    setSettings(settings)
    setCategories(byOrder(snap.data.categories))
    setBills(snap.data.bills)
    setTransactions(snap.data.transactions)
    setGoals(snap.data.goals)
    setRules(snap.data.rules)
  }, [])

  const value: AppData = {
    ready, persistent, settings, categories, bills, transactions, goals, rules, ratesStatus,
    saveTransaction, removeTransaction, saveBill, removeBill, pay, unpay, saveGoal, removeGoal, saveCategory, removeCategory, updateSettings, refreshRates, fixRate, exportData, importData,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
