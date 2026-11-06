export type AlertLevel = 'critico' | 'atencao' | 'info'
export type AlertTarget = 'contas' | 'plano' | 'lancar' | 'painel' | 'ajustes'

export interface Alert {
  id: string
  nivel: AlertLevel
  titulo: string
  detalhe?: string
  destino: AlertTarget
}

interface Input {
  atrasadas: { count: number; total: number }
  /** Contas que vencem nos próximos 7 dias (sem as atrasadas). */
  proximas: { count: number; total: number }
  /** Total que temos menos as contas pendentes do mês. */
  sobra: number
  /** Quantos meses de gastos a reserva cobre; null se ainda não há gastos para a média. */
  mesesReserva: number | null
  reserva: number
  metasAtrasadas: number
  /** Falta guardar mais por mês do que costuma sobrar (null = sem dados). */
  faltaGuardar: number | null
  /** Nomes das categorias cujo gasto já passou do limite do mês e das que vão passar com as contas pendentes. */
  orcamento?: { estourou: string[]; passa: string[] }
  semEntradasNoMes: boolean
  cambioDesatualizado: boolean
  money: (cents: number) => string
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const LEVEL: Record<AlertLevel, number> = { critico: 0, atencao: 1, info: 2 }

/** O que merece atenção agora, do mais grave ao menos grave. Lista vazia = tudo em dia. */
export function buildAlerts(i: Input): Alert[] {
  const out: Alert[] = []
  if (i.atrasadas.count > 0)
    out.push({ id: 'atrasadas', nivel: 'critico', titulo: `${plural(i.atrasadas.count, 'conta atrasada', 'contas atrasadas')}`, detalhe: `${i.money(i.atrasadas.total)} para pagar já`, destino: 'contas' })
  if (i.sobra < 0)
    out.push({ id: 'sobra', nivel: 'critico', titulo: 'O dinheiro não cobre as contas do mês', detalhe: `Faltam ${i.money(-i.sobra)} depois das contas`, destino: 'painel' })
  if (i.metasAtrasadas > 0)
    out.push({ id: 'metas', nivel: 'critico', titulo: `${plural(i.metasAtrasadas, 'meta com prazo vencido', 'metas com prazo vencido')}`, detalhe: 'Atualize a data para recalcular', destino: 'plano' })
  if (i.orcamento && i.orcamento.estourou.length > 0)
    out.push({ id: 'orc-estourou', nivel: 'critico', titulo: `${plural(i.orcamento.estourou.length, 'limite estourado', 'limites estourados')} neste mês`, detalhe: i.orcamento.estourou.join(', '), destino: 'painel' })
  if (i.orcamento && i.orcamento.passa.length > 0)
    out.push({ id: 'orc-passa', nivel: 'atencao', titulo: `Com as contas do mês, ${plural(i.orcamento.passa.length, 'limite vai passar', 'limites vão passar')}`, detalhe: i.orcamento.passa.join(', '), destino: 'painel' })
  if (i.proximas.count > 0)
    out.push({ id: 'proximas', nivel: 'atencao', titulo: `${plural(i.proximas.count, 'conta vence', 'contas vencem')} nos próximos 7 dias`, detalhe: i.money(i.proximas.total), destino: 'contas' })
  if (i.faltaGuardar !== null && i.faltaGuardar > 0)
    out.push({ id: 'guardar', nivel: 'atencao', titulo: 'O que sobra não cobre o que precisam guardar', detalhe: `Faltam ${i.money(i.faltaGuardar)} por mês para cumprir as metas`, destino: 'plano' })
  if (i.mesesReserva !== null && i.reserva > 0 && i.mesesReserva < 3)
    out.push({ id: 'reserva', nivel: 'atencao', titulo: 'Reserva abaixo de 3 meses de gastos', detalhe: `Cobre cerca de ${i.mesesReserva.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${i.mesesReserva === 1 ? 'mês' : 'meses'}`, destino: 'painel' })
  if (i.semEntradasNoMes)
    out.push({ id: 'entradas', nivel: 'info', titulo: 'Nenhuma entrada lançada neste mês', detalhe: 'Lance os salários para o total ficar certo', destino: 'lancar' })
  if (i.cambioDesatualizado)
    out.push({ id: 'cambio', nivel: 'info', titulo: 'Câmbio desatualizado', detalhe: 'Atualize para converter com a cotação de hoje', destino: 'ajustes' })
  return out.sort((a, b) => LEVEL[a.nivel] - LEVEL[b.nivel])
}
