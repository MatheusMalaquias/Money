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
  /** Compra no cartão de crédito: o vencimento é o da fatura (ver domain/card.ts). */
  cartao?: boolean
  compraEm?: ISODate
  /** Último vencimento de uma conta recorrente (ex.: últimas parcelas). Sem isso, repete para sempre. */
  fim?: ISODate
  status: 'pendente' | 'paga'
  pagaEm?: ISODate
  /** Lançamento de saída criado ao pagar. */
  transacaoId?: string
  /** Próxima ocorrência criada ao pagar (para desfazer). */
  proximaId?: string
  serieId: string
}

export interface Transaction extends Base {
  /** 'reserva' é dinheiro separado na reserva: não é ganho nem gasto, só muda o que está disponível. */
  tipo: 'entrada' | 'saida' | 'reserva'
  /** Só em 'reserva': true = tirou da reserva; false/ausente = guardou. */
  retirada?: boolean
  /** Só em 'reserva': dinheiro novo que entrou direto na reserva (já tinham guardado, veio de fora). Aumenta o total e a reserva. */
  aporte?: boolean
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
  /** Entrada gerada por um salário fixo (ver Settings.salarios). */
  salarioId?: string
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

/** Fatura do cartão: dia em que fecha e dia em que vence (1 a 31). */
export interface CardCfg {
  fechamento: number
  vencimento: number
}

/** Salário que se repete todo mês: vira uma entrada sozinho no dia combinado (ver domain/salary.ts). */
export interface Salary {
  id: string
  descricao: string
  valorCents: number
  moeda: Currency
  pessoa: PersonId
  categoriaId: string
  /** Dia do mês em que cai (1 a 31; em meses curtos vale o último dia). */
  dia: number
  /** Primeiro e último mês ("YYYY-MM"); sem fim, repete para sempre. */
  inicio: string
  fim?: string
  /** false = este salário fica fora do dízimo. */
  dizimo?: boolean
  /** Meses em que a entrada foi apagada à mão: não volta a ser criada. */
  puladas?: string[]
}

/** Limite mensal de gastos de uma categoria. */
export interface Budget {
  categoriaId: string
  valorCents: number
  moeda: Currency
}

export interface Settings {
  moedaExibicao: Currency
  /** Dízimo sobre as entradas, em pontos-base (1000 = 10%). 0 desliga. */
  dizimoBps: number
  /** Fatura do cartão de crédito. */
  cartao?: CardCfg
  pessoas: { id: PersonId; nome: string }[]
  salarios?: Salary[]
  orcamentos?: Budget[]
  rates: RatesState
  schemaVersion: number
}
