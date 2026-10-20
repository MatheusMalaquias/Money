import { describe, expect, it } from 'vitest'
import { billState, payBill, sortBills, unpayBill } from '../src/domain/bills'
import { addMonths, clampedDate, diffDays, toBR } from '../src/domain/dates'
import { centsToInput, convert, formatMoney, parseAmount } from '../src/domain/money'
import { summarizeMonth } from '../src/domain/month'
import { nextDue } from '../src/domain/recurrence'
import { DEFAULT_RATES, mergeFetched, setManual } from '../src/domain/rates'
import type { Bill, Transaction } from '../src/domain/types'

const perUSD = { USD: 1, BRL: 5, EUR: 0.8 }
let n = 0
const newId = () => `id${++n}`

const bill = (o: Partial<Bill> = {}): Bill => ({
  id: 'b1', createdAt: 'x', updatedAt: 'x', descricao: 'Aluguel', valorCents: 150000, moeda: 'BRL',
  vencimento: '2026-10-31', diaAncora: 31, categoriaId: 'c1', pessoa: 'casal', recorrencia: 'mensal',
  status: 'pendente', serieId: 's1', ...o,
})
const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: 't1', createdAt: 'x', updatedAt: 'x', tipo: 'saida', valorCents: 10000, moeda: 'BRL', data: '2026-10-10',
  categoriaId: 'c1', descricao: '', pessoa: 'eu', cambio: perUSD, ...o,
})

describe('money', () => {
  it('lê valores digitados', () => {
    expect(parseAmount('1.234,56')).toBe(123456)
    expect(parseAmount('1234,5')).toBe(123450)
    expect(parseAmount('1234.56')).toBe(123456)
    expect(parseAmount('1.234')).toBe(123400)
    expect(parseAmount('12.5')).toBe(1250)
    expect(parseAmount('R$ 10')).toBe(1000)
    expect(parseAmount('0,07')).toBe(7)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1,234')).toBeNull() // 3 casas decimais: ambíguo, rejeita
    expect(parseAmount('-5')).toBeNull()
  })
  it('não sofre erro de float (0,10 + 0,20)', () => {
    expect(parseAmount('0,10')! + parseAmount('0,20')!).toBe(30)
  })
  it('formata e edita', () => {
    expect(formatMoney(123456, 'BRL').replace(/\s/g, ' ')).toBe('R$ 1.234,56')
    expect(formatMoney(123456, 'USD').replace(/\s/g, ' ')).toBe('US$ 1.234,56')
    expect(centsToInput(123405)).toBe('1234,05')
  })
  it('converte entre moedas', () => {
    expect(convert(100000, 'USD', 'BRL', perUSD)).toBe(500000)
    expect(convert(500000, 'BRL', 'USD', perUSD)).toBe(100000)
    expect(convert(100000, 'USD', 'EUR', perUSD)).toBe(80000)
    expect(convert(123, 'BRL', 'BRL', perUSD)).toBe(123)
    expect(convert(1, 'BRL', 'USD', perUSD)).toBe(0) // arredonda uma vez, no fim
  })
})

describe('datas e recorrência', () => {
  it('formata dd/mm/aaaa e calcula dias', () => {
    expect(toBR('2026-10-20')).toBe('20/10/2026')
    expect(diffDays('2026-10-20', '2026-10-27')).toBe(7)
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
  })
  it('soma meses atravessando o ano', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
  it('limita o dia ao fim do mês', () => {
    expect(clampedDate('2026-02', 31)).toBe('2026-02-28')
    expect(clampedDate('2028-02', 31)).toBe('2028-02-29')
  })
  it('mensal no dia 31 volta ao 31 depois de fevereiro', () => {
    const fev = nextDue('2026-01-31', 'mensal', 31)!
    expect(fev).toBe('2026-02-28')
    expect(nextDue(fev, 'mensal', 31)).toBe('2026-03-31')
  })
  it('anual e única', () => {
    expect(nextDue('2026-10-20', 'anual', 20)).toBe('2027-10-20')
    expect(nextDue('2028-02-29', 'anual', 29)).toBe('2029-02-28')
    expect(nextDue('2026-10-20', 'unica', 20)).toBeNull()
  })
})

describe('contas a pagar', () => {
  it('classifica vencida, próximos 7 dias e futura', () => {
    const today = '2026-10-20'
    expect(billState(bill({ vencimento: '2026-10-19' }), today)).toBe('vencida')
    expect(billState(bill({ vencimento: '2026-10-20' }), today)).toBe('semana')
    expect(billState(bill({ vencimento: '2026-10-27' }), today)).toBe('semana')
    expect(billState(bill({ vencimento: '2026-10-28' }), today)).toBe('futura')
    expect(billState(bill({ status: 'paga' }), today)).toBe('paga')
  })
  it('ordena por vencimento, pendentes antes das pagas', () => {
    const list = sortBills([
      bill({ id: 'a', vencimento: '2026-11-05' }),
      bill({ id: 'p', status: 'paga', pagaEm: '2026-10-01' }),
      bill({ id: 'b', vencimento: '2026-10-05' }),
    ])
    expect(list.map((b) => b.id)).toEqual(['b', 'a', 'p'])
  })
  it('pagar gera lançamento de saída e a próxima ocorrência', () => {
    const r = payBill(bill(), { now: 'n', today: '2026-10-25', perUSD, newId })
    expect(r.bill.status).toBe('paga')
    expect(r.bill.pagaEm).toBe('2026-10-25')
    expect(r.transaction).toMatchObject({ tipo: 'saida', valorCents: 150000, moeda: 'BRL', data: '2026-10-25', contaId: 'b1' })
    expect(r.next).toMatchObject({ status: 'pendente', vencimento: '2026-11-30', diaAncora: 31, serieId: 's1' })
    expect(r.bill.proximaId).toBe(r.next!.id)
    expect(r.bill.transacaoId).toBe(r.transaction.id)
  })
  it('conta única não gera próxima', () => {
    expect(payBill(bill({ recorrencia: 'unica' }), { now: 'n', today: '2026-10-25', perUSD, newId }).next).toBeUndefined()
  })
  it('não paga duas vezes', () => {
    expect(() => payBill(bill({ status: 'paga' }), { now: 'n', today: '2026-10-25', perUSD, newId })).toThrow()
  })
  it('desfazer remove o lançamento e a próxima ainda pendente', () => {
    const r = payBill(bill(), { now: 'n', today: '2026-10-25', perUSD, newId })
    const u = unpayBill(r.bill, [r.bill, r.next!], 'n2')
    expect(u.bill.status).toBe('pendente')
    expect(u.removeTransactionId).toBe(r.transaction.id)
    expect(u.removeBillId).toBe(r.next!.id)
  })
  it('desfazer mantém a próxima se ela já foi paga', () => {
    const r = payBill(bill(), { now: 'n', today: '2026-10-25', perUSD, newId })
    const nextPaga = { ...r.next!, status: 'paga' as const }
    expect(unpayBill(r.bill, [r.bill, nextPaga], 'n2').removeBillId).toBeUndefined()
  })
})

describe('resumo do mês', () => {
  const base = { mes: '2026-10', rates: perUSD, moeda: 'BRL' as const, pessoa: 'todos' as const }
  it('soma entradas e saídas convertendo pelo câmbio do lançamento', () => {
    const s = summarizeMonth({
      ...base,
      bills: [],
      transactions: [
        tx({ id: '1', tipo: 'entrada', valorCents: 400000, moeda: 'USD', cambio: { USD: 1, BRL: 4, EUR: 0.8 } }), // 4000 USD a 4,00 = R$ 16.000
        tx({ id: '2', tipo: 'entrada', valorCents: 300000, moeda: 'BRL' }),
        tx({ id: '3', valorCents: 100000, moeda: 'BRL', categoriaId: 'a' }),
        tx({ id: '4', valorCents: 50000, moeda: 'BRL', categoriaId: 'b' }),
        tx({ id: '5', valorCents: 99999, data: '2026-09-30' }), // outro mês
      ],
    })
    expect(s.entradas).toBe(1_900_000)
    expect(s.saidas).toBe(150000)
    expect(s.saldo).toBe(1_750_000)
    expect(s.porCategoria).toEqual([{ categoriaId: 'a', total: 100000 }, { categoriaId: 'b', total: 50000 }])
    expect(s.porMoeda.USD.entradas).toBe(400000)
  })
  it('falta pagar considera só pendentes do mês, pela cotação atual', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [],
      bills: [
        bill({ id: '1', valorCents: 100000 }),
        bill({ id: '2', valorCents: 10000, moeda: 'USD' }), // US$ 100 a 5,00 = R$ 500
        bill({ id: '3', status: 'paga' }),
        bill({ id: '4', vencimento: '2026-11-01' }),
      ],
    })
    expect(s.faltaPagar).toBe(150000)
    expect(s.porMoeda.USD.faltaPagar).toBe(10000)
  })
  it('filtra por pessoa', () => {
    const s = summarizeMonth({ ...base, pessoa: 'esposa', bills: [], transactions: [tx({ pessoa: 'eu' }), tx({ id: '9', pessoa: 'esposa', valorCents: 700 })] })
    expect(s.saidas).toBe(700)
  })
})

describe('câmbio', () => {
  it('atualização automática respeita o que foi fixado à mão', () => {
    let r = setManual(DEFAULT_RATES, 'BRL', 5.5)
    r = mergeFetched(r, { USD: 1, BRL: 5.05, EUR: 0.89 }, '2026-10-19')
    expect(r.perUSD.BRL).toBe(5.5)
    expect(r.perUSD.EUR).toBe(0.89)
    expect(r.date).toBe('2026-10-19')
    r = setManual(r, 'BRL', null)
    expect(mergeFetched(r, { USD: 1, BRL: 5.05, EUR: 0.89 }, '2026-10-20').perUSD.BRL).toBe(5.05)
  })
})
