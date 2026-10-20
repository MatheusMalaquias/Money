export type Currency = 'BRL' | 'USD' | 'EUR'
export const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

/** Id de pessoa: 'eu' e 'esposa' (nomes editáveis em Ajustes) ou 'casal'. */
export type PersonId = string
export const COUPLE = 'casal'

/** Data local no formato YYYY-MM-DD (nunca com fuso: evita o "dia anterior" do toISOString). */
export type ISODate = string

/** Quantas unidades de cada moeda valem 1 USD. É a base de todas as conversões. */
export type PerUSD = Record<Currency, number>

interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Category extends Base {
  nome: string
  cor: string
  ordem: number
  /** Categoria que o app usa por conta própria (ex.: 'dizimo'): se o usuário renomear, o app ainda a encontra. */
  chave?: 'dizimo'
}

export type Recurrence = 'unica' | 'mensal' | 'anual'

export interface Bill extends Base {
  descricao: string
  valorCents: number
  moeda: Currency
  vencimento: ISODate
  /** Dia do mês original (ex.: 31). Sem ele, uma conta do dia 31 "escorregaria" para o dia 28 após fevereiro. */
  diaAncora: number
  categoriaId: string
  pessoa: PersonId
  recorrencia: Recurrence
  status: 'pendente' | 'paga'
  pagaEm?: ISODate
  /** Lançamento de saída criado ao pagar. */
  transacaoId?: string
  /** Próxima ocorrência criada ao pagar (para desfazer). */
  proximaId?: string
  serieId: string
}

export interface Transaction extends Base {
  tipo: 'entrada' | 'saida'
  valorCents: number
  moeda: Currency
  data: ISODate
  categoriaId: string
  descricao: string
  pessoa: PersonId
  contaId?: string
  /** Entrada: descontar o dízimo deste valor. */
  dizimo?: boolean
  /** Saída gerada automaticamente: id da entrada que originou este dízimo. */
  dizimoDeId?: string
  /** Câmbio no momento do lançamento: o mês passado não muda quando a cotação muda. */
  cambio: PerUSD
}

export interface Goal extends Base {
  nome: string
  alvoCents: number
  atualCents: number
  moeda: Currency
  prazo?: ISODate
  pessoa: PersonId
}

export interface PlanRule extends Base {
  nome: string
  /** Pontos-base: 3000 = 30,00%. Inteiro para não acumular erro de float. */
  basisPoints: number
  categoriaId?: string
}

export interface RatesState {
  perUSD: PerUSD
  /** Data da cotação (ISO) ou null se ainda nunca foi atualizada. */
  date: ISODate | null
  /** Moedas que o usuário fixou à mão: a atualização automática não as sobrescreve. */
  manual: Currency[]
}

export interface Settings {
  moedaExibicao: Currency
  /** Dízimo sobre as entradas, em pontos-base (1000 = 10%). 0 desliga. */
  dizimoBps: number
  pessoas: { id: PersonId; nome: string }[]
  rates: RatesState
  schemaVersion: number
}
