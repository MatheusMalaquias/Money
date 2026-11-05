import type { Bill, Category, Goal, PlanRule, Settings, Transaction } from '../domain/types'

/** Todas as coleções do app. Para trocar o banco (ex.: Supabase), basta outra implementação de Storage. */
export interface Entities {
  categories: Category
  bills: Bill
  transactions: Transaction
  goals: Goal
  rules: PlanRule
}
export type StoreName = keyof Entities
export const STORE_NAMES: StoreName[] = ['categories', 'bills', 'transactions', 'goals', 'rules']

/** Foto completa dos dados: é o formato do backup JSON. */
export interface Snapshot {
  data: { [K in StoreName]: Entities[K][] }
  settings: Settings | null
}

/** Contrato único entre a interface e o banco. A UI nunca importa IndexedDB diretamente. */
export interface Storage {
  getAll<K extends StoreName>(store: K): Promise<Entities[K][]>
  get<K extends StoreName>(store: K, id: string): Promise<Entities[K] | undefined>
  put<K extends StoreName>(store: K, item: Entities[K]): Promise<void>
  putMany<K extends StoreName>(store: K, items: Entities[K][]): Promise<void>
  remove(store: StoreName, id: string): Promise<void>
  getSettings(): Promise<Settings | null>
  saveSettings(settings: Settings): Promise<void>
  /** Exporta tudo. */
  snapshot(): Promise<Snapshot>
  /** Substitui tudo pelo conteúdo (importação de backup), numa única transação. */
  restore(snapshot: Snapshot): Promise<void>
}

/** Uma alteração local ainda não enviada à nuvem. A chave é "loja:id": várias edições do mesmo registro viram uma só. */
export interface OutboxOp {
  key: string
  store: StoreName | 'settings'
  id: string
  deleted: boolean
  /** Quando foi feita; serve para não descartar uma edição mais nova que chegou durante o envio. */
  at: number
}

export interface Outbox {
  add(op: Omit<OutboxOp, 'key' | 'at'>): Promise<void>
  list(): Promise<OutboxOp[]>
  /** Remove só as operações cujo `at` não mudou desde que foram lidas. */
  remove(ops: OutboxOp[]): Promise<void>
  clear(): Promise<void>
}
