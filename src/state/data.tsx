import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { payBill, planNewBill, reconcileSeries, unpayBill } from '../domain/bills'
import { dedupeCategories } from '../domain/categories'
import { todayISO, diffDays } from '../domain/dates'
import { defaultSettings, seedCategories } from '../domain/defaults'
import { buildSalaryTx, salaryMonths, salaryTxId } from '../domain/salary'
import { buildTithe, DEFAULT_TITHE_BPS, entersTithe, titheAmount } from '../domain/tithe'
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


interface Loaded {
  storage: Storage
  persistent: boolean
  settings: Settings
  categories: Category[]
  bills: Bill[]
  transactions: Transaction[]
  goals: Goal[]
  rules: PlanRule[]
}

/** Abre o banco, faz a primeira execução (configurações e categorias) e as correções de bases antigas. */
async function loadAll(injected?: Storage): Promise<Loaded> {
  let storage: Storage
  let persistent = true
  try {
    storage = injected ?? (await createIndexedDBStorage())
  } catch {
    storage = createMemoryStorage()
    persistent = false
  }
  let settings = await storage.getSettings()
  let categories = await storage.getAll('categories')
  // nomes padrão antigos (Eu/Esposa) viram os nomes de vocês, desde que ainda não tenham sido trocados
  if (settings && settings.pessoas.length === 2 && settings.pessoas[0].nome === 'Eu' && settings.pessoas[1].nome === 'Esposa') {
    settings = { ...settings, pessoas: [{ ...settings.pessoas[0], nome: 'Matheus' }, { ...settings.pessoas[1], nome: 'Gabi' }] }
    await storage.saveSettings(settings)
  }
  if (!settings) {
    settings = defaultSettings()
    await storage.saveSettings(settings)
    categories = seedCategories(nowISO(), newId)
    await storage.putMany('categories', categories) // só na primeira execução
  }
  let [bills, transactions] = await Promise.all([storage.getAll('bills'), storage.getAll('transactions')])
  const goals = await storage.getAll('goals')
  const rules = await storage.getAll('rules')

  // une categorias repetidas e religa tudo que usava as duplicadas
  const usage = new Map<string, number>()
  for (const x of [...bills, ...transactions]) usage.set(x.categoriaId, (usage.get(x.categoriaId) ?? 0) + 1)
  const { keep, remap } = dedupeCategories(categories, usage)
  if (remap.size > 0) {
    bills = bills.map((b) => (remap.has(b.categoriaId) ? { ...b, categoriaId: remap.get(b.categoriaId)! } : b))
    transactions = transactions.map((t) => (remap.has(t.categoriaId) ? { ...t, categoriaId: remap.get(t.categoriaId)! } : t))
    await storage.putMany('bills', bills)
    await storage.putMany('transactions', transactions)
    for (const id of remap.keys()) await storage.remove('categories', id)
    categories = keep
  }
  return { storage, persistent, settings, categories, bills, transactions, goals, rules }
}

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
  /** Cadastra uma conta nova; com `paidOn` ela já nasce paga e desconta do total. */
  createBill(b: Bill, paidOn?: string): Promise<void>
  removeBill(id: string): Promise<void>
  /** Exclui esta conta e as parcelas pendentes seguintes da mesma série. */
  removeBillAndNext(id: string): Promise<void>
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

export function DataProvider({ children, storage: injected, refreshKey = 0 }: { children: ReactNode; storage?: Storage; /** Muda quando a nuvem trouxe dados novos: relê tudo do armazenamento. */ refreshKey?: number }) {
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

  // O carregamento inicial é uma promessa única: o modo de desenvolvimento do React roda o efeito duas vezes,
  // e duas execuções simultâneas criariam as categorias em dobro.
  const loading = useRef<Promise<Loaded> | null>(null)
  useEffect(() => {
    let alive = true
    loading.current ??= loadAll(injected)
    void loading.current.then((r) => {
      if (!alive) return
      st.current = r.storage
      setPersistent(r.persistent)
      setSettings(r.settings)
      setCategories(byOrder(r.categories))
      setBills(r.bills)
      setTransactions(r.transactions)
      setGoals(r.goals)
      setRules(r.rules)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [injected])

  // a nuvem trouxe mudanças de outro aparelho: relê tudo (sem recriar categorias nem configurações)
  useEffect(() => {
    if (!ready || refreshKey === 0 || !st.current) return
    let alive = true
    void loadAll(st.current).then((r) => {
      if (!alive) return
      setSettings(r.settings)
      setCategories(byOrder(r.categories))
      setBills(r.bills)
      setTransactions(r.transactions)
      setGoals(r.goals)
      setRules(r.rules)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

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
      if (entersTithe(income) && titheAmount(income.valorCents, bps) > 0) {
        const d = buildTithe(income, { now: nowISO(), categoriaId: await ensureTitheCategory(), bps, existing })
        await st.current!.put('transactions', d)
        setTransactions((l) => upsert(l, d))
      } else if (existing) {
        await st.current!.remove('transactions', existing.id)
        setTransactions((l) => l.filter((x) => x.id !== existing.id))
      }
    },
    [ensureTitheCategory]
  )

  /**
   * Deixa o dízimo de TODAS as entradas em dia, sem ninguém lançar nada:
   * cria o que falta (inclusive para entradas antigas) e, do mês atual em diante, acerta valores quando o percentual muda.
   * Meses passados já fechados não são recalculados.
   */
  const syncAllTithes = useCallback(async () => {
    const { transactions: all, settings: cfg } = live.current
    const bps = cfg.dizimoBps ?? DEFAULT_TITHE_BPS
    const from = `${todayISO().slice(0, 8)}01`
    const byOrigin = new Map(all.filter((t) => t.dizimoDeId).map((t) => [t.dizimoDeId!, t]))
    const puts: Transaction[] = []
    const removes: string[] = []
    let categoriaId: string | null = null
    for (const inc of all.filter((t) => t.tipo === 'entrada' && !t.dizimoDeId)) {
      const existing = byOrigin.get(inc.id)
      const amount = titheAmount(inc.valorCents, bps)
      if (entersTithe(inc) && amount > 0) {
        if (!existing || (existing.valorCents !== amount && inc.data >= from)) {
          categoriaId ??= await ensureTitheCategory()
          puts.push(buildTithe(inc, { now: nowISO(), categoriaId, bps, existing }))
        }
      } else if (existing && (inc.dizimo === false || inc.data >= from)) {
        removes.push(existing.id)
      }
    }
    if (!puts.length && !removes.length) return
    await st.current!.putMany('transactions', puts)
    for (const id of removes) await st.current!.remove('transactions', id)
    setTransactions((l) => puts.reduce(upsert, l.filter((t) => !removes.includes(t.id))))
  }, [ensureTitheCategory])

  // roda ao abrir e quando o percentual muda; uma execução por vez
  const syncing = useRef<Promise<void> | null>(null)
  useEffect(() => {
    if (!ready) return
    syncing.current ??= syncAllTithes().finally(() => {
      syncing.current = null
    })
  }, [ready, settings.dizimoBps, syncAllTithes])

  const saveTransaction = useCallback(
    async (t: Transaction) => {
      await st.current!.put('transactions', t)
      setTransactions((l) => upsert(l, t))
      if (t.tipo === 'entrada') await syncTithe(t)
    },
    [syncTithe]
  )

  // salários fixos: cria a entrada de cada mês que já chegou (uma vez só; o id é fixo por salário e mês)
  useEffect(() => {
    if (!ready) return
    const hoje = todayISO()
    void (async () => {
      for (const sal of live.current.settings.salarios ?? []) {
        for (const mes of salaryMonths(sal, hoje)) {
          if (live.current.transactions.some((t) => t.id === salaryTxId(sal.id, mes))) continue
          await saveTransaction(buildSalaryTx(sal, mes, { now: nowISO(), perUSD: live.current.settings.rates.perUSD }))
        }
      }
    })()
  }, [ready, settings.salarios, saveTransaction])

  const saveBill = useCallback(async (b: Bill) => {
    const { add, removeIds } = reconcileSeries(b, live.current.bills, { now: nowISO(), newId })
    await st.current!.putMany('bills', [b, ...add])
    for (const id of removeIds) await st.current!.remove('bills', id)
    setBills((l) => [...l.filter((x) => !removeIds.includes(x.id)).map((x) => (x.id === b.id ? b : x)), ...(l.some((x) => x.id === b.id) ? [] : [b]), ...add])
  }, [])

  const createBill = useCallback(async (b: Bill, paidOn?: string) => {
    const { bills: put, transaction } = planNewBill(b, live.current.bills, { paidOn, now: nowISO(), perUSD: live.current.settings.rates.perUSD, newId })
    await st.current!.putMany('bills', put)
    if (transaction) await st.current!.put('transactions', transaction)
    setBills((l) => put.reduce(upsert, l))
    if (transaction) setTransactions((l) => upsert(l, transaction))
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
    const r = payBill(bill, { now: nowISO(), today: todayISO(), perUSD: live.current.settings.rates.perUSD, newId, series: live.current.bills })
    await st.current!.putMany('bills', r.next ? [r.bill, r.next] : [r.bill])
    await st.current!.put('transactions', r.transaction)
    setBills((l) => (r.next ? upsert(upsert(l, r.bill), r.next) : upsert(l, r.bill)))
    setTransactions((l) => upsert(l, r.transaction))
  }, [])

  const removeTransaction = useCallback(
    async (id: string) => {
      const linked = live.current.bills.find((b) => b.transacaoId === id)
      if (linked) return unpay(linked.id) // lançamento gerado por uma conta: excluir = desfazer o pagamento
      // entrada de salário fixo apagada à mão: o mês fica marcado para não ser recriado
      const own = live.current.transactions.find((x) => x.id === id)
      if (own?.salarioId) {
        const mes = own.data.slice(0, 7)
        const salarios = (live.current.settings.salarios ?? []).map((sal) => (sal.id === own.salarioId ? { ...sal, puladas: [...new Set([...(sal.puladas ?? []), mes])] } : sal))
        await updateSettings({ salarios })
      }
      // apagar uma entrada leva junto o dízimo que ela gerou
      const gone = new Set([id, ...live.current.transactions.filter((x) => x.dizimoDeId === id).map((x) => x.id)])
      for (const g of gone) await st.current!.remove('transactions', g)
      setTransactions((l) => l.filter((t) => !gone.has(t.id)))
    },
    [unpay, updateSettings]
  )

  /** Apaga as contas e, nas já pagas, também o lançamento do pagamento (o valor volta ao total). */
  const deleteBills = useCallback(async (ids: Set<string>) => {
    const gone = live.current.bills.filter((b) => ids.has(b.id))
    const txIds = new Set(gone.map((b) => b.transacaoId).filter((x): x is string => !!x))
    for (const b of gone) await st.current!.remove('bills', b.id)
    for (const id of txIds) await st.current!.remove('transactions', id)
    setBills((l) => l.filter((b) => !ids.has(b.id)))
    setTransactions((l) => l.filter((t) => !txIds.has(t.id)))
  }, [])

  const removeBill = useCallback((id: string) => deleteBills(new Set([id])), [deleteBills])

  const removeBillAndNext = useCallback(
    async (id: string) => {
      const bill = live.current.bills.find((b) => b.id === id)
      if (!bill) return
      // esta conta (mesmo paga) e as parcelas pendentes seguintes da mesma série
      const ids = new Set(live.current.bills.filter((b) => b.id === id || (b.serieId === bill.serieId && b.status === 'pendente' && b.vencimento >= bill.vencimento)).map((b) => b.id))
      await deleteBills(ids)
    },
    [deleteBills]
  )

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
    saveTransaction, removeTransaction, saveBill, createBill, removeBill, removeBillAndNext, pay, unpay, saveGoal, removeGoal, saveCategory, removeCategory, updateSettings, refreshRates, fixRate, exportData, importData,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
