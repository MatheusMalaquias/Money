import { DEFAULT_RATES } from './rates'
import type { Category, Settings } from './types'

export const DEFAULT_CATEGORIES: { nome: string; cor: string }[] = [
  { nome: 'Moradia', cor: '#38bdf8' },
  { nome: 'Alimentação', cor: '#34d399' },
  { nome: 'Transporte', cor: '#fbbf24' },
  { nome: 'Saúde', cor: '#f87171' },
  { nome: 'Lazer', cor: '#c084fc' },
  { nome: 'Educação', cor: '#818cf8' },
  { nome: 'Trabalho', cor: '#2dd4bf' },
  { nome: 'Viagem e mudança', cor: '#fb923c' },
  { nome: 'Outros', cor: '#94a3b8' },
]

export const seedCategories = (now: string, newId: () => string): Category[] =>
  DEFAULT_CATEGORIES.map((c, i) => ({ id: newId(), createdAt: now, updatedAt: now, ordem: i, ...c }))

export const defaultSettings = (): Settings => ({
  moedaExibicao: 'BRL',
  pessoas: [
    { id: 'eu', nome: 'Eu' },
    { id: 'esposa', nome: 'Esposa' },
  ],
  rates: DEFAULT_RATES,
  schemaVersion: 1,
})
