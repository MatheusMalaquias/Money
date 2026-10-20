import { describe, expect, it } from 'vitest'
import { cardInvoice } from '../src/domain/card'

describe('fatura do cartão (fecha dia 19, vence dia 26)', () => {
  const f = (d: string) => cardInvoice(d, { fechamento: 19, vencimento: 26 })
  it('compra até o dia 19 entra na fatura que vence dia 26 do mesmo mês', () => {
    expect(f('2026-10-01')).toEqual({ fecha: '2026-10-19', vence: '2026-10-26' })
    expect(f('2026-10-19')).toEqual({ fecha: '2026-10-19', vence: '2026-10-26' }) // o próprio dia do fechamento ainda entra
  })
  it('compra depois do dia 19 cai na fatura do mês seguinte', () => {
    expect(f('2026-10-20')).toEqual({ fecha: '2026-11-19', vence: '2026-11-26' })
    expect(f('2026-10-31')).toEqual({ fecha: '2026-11-19', vence: '2026-11-26' })
  })
  it('vira o ano', () => {
    expect(f('2026-12-20')).toEqual({ fecha: '2027-01-19', vence: '2027-01-26' })
  })
  it('vencimento antes do fechamento vai para o mês seguinte (fecha 25, vence 5)', () => {
    const g = (d: string) => cardInvoice(d, { fechamento: 25, vencimento: 5 })
    expect(g('2026-10-10')).toEqual({ fecha: '2026-10-25', vence: '2026-11-05' })
    expect(g('2026-10-26')).toEqual({ fecha: '2026-11-25', vence: '2026-12-05' })
  })
  it('limita ao último dia do mês curto (fecha 31)', () => {
    const h = cardInvoice('2027-02-10', { fechamento: 31, vencimento: 31 })
    expect(h.fecha).toBe('2027-02-28')
  })
})
