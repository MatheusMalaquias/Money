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
