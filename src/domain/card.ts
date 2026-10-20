import { addMonths, clampedDate } from './dates'
import type { CardCfg, ISODate } from './types'

export const DEFAULT_CARD: CardCfg = { fechamento: 19, vencimento: 26 }

/**
 * Em qual fatura cai uma compra. Compra até o dia de fechamento (inclusive) entra na fatura que fecha neste mês;
 * depois dele, na do mês seguinte. O vencimento cai no mesmo mês do fechamento se o dia for maior que o do fechamento
 * (fecha 19, vence 26), senão no mês seguinte (fecha 25, vence 5).
 */
export function cardInvoice(compra: ISODate, cfg: CardCfg = DEFAULT_CARD): { fecha: ISODate; vence: ISODate } {
  const mes = compra.slice(0, 7)
  const closingMonth = compra <= clampedDate(mes, cfg.fechamento) ? mes : addMonths(mes, 1)
  const dueMonth = cfg.vencimento > cfg.fechamento ? closingMonth : addMonths(closingMonth, 1)
  return { fecha: clampedDate(closingMonth, cfg.fechamento), vence: clampedDate(dueMonth, cfg.vencimento) }
}
