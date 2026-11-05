import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createLock, PIN_RE, verifyPin, waitSeconds } from '../src/lock'

beforeAll(() => {
  // o Node 18 não expõe o WebCrypto global; o navegador expõe
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
})

const FAST = 1000 // voltas do PBKDF2 só nos testes, para não demorar

describe('PIN', () => {
  it('aceita de 4 a 8 números e recusa o resto', () => {
    for (const ok of ['1234', '123456', '12345678']) expect(PIN_RE.test(ok)).toBe(true)
    for (const bad of ['123', '123456789', '12a4', '', '12 34', '١٢٣٤']) expect(PIN_RE.test(bad)).toBe(false)
  })
  it('não guarda o PIN: só o resumo, e o sal muda a cada criação', async () => {
    const a = await createLock('4821', FAST)
    const b = await createLock('4821', FAST)
    expect(JSON.stringify(a)).not.toContain('4821')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })
  it('recusa um PIN inválido ao criar', async () => {
    await expect(createLock('12', FAST)).rejects.toThrow('4 a 8')
  })
  it('PIN certo entra e zera os erros; PIN errado conta o erro', async () => {
    const rec = await createLock('4821', FAST)
    const bad = await verifyPin('0000', rec, 1000)
    expect(bad).toMatchObject({ ok: false })
    expect(bad.record.fails).toBe(1)
    const good = await verifyPin('4821', bad.record, 2000)
    expect(good.ok).toBe(true)
    expect(good.record.fails).toBe(0)
  })
  it('depois de 5 erros seguidos trava, e nem o PIN certo entra durante a espera', async () => {
    let rec = await createLock('4821', FAST)
    let now = 1_000_000
    for (let i = 0; i < 5; i++) rec = (await verifyPin('0000', rec, now)).record
    expect(rec.fails).toBe(5)
    expect(rec.until).toBe(now + 30_000)
    const during = await verifyPin('4821', rec, now + 10_000)
    expect(during).toMatchObject({ ok: false, waitSeconds: 20 })
    const after = await verifyPin('4821', rec, now + 31_000)
    expect(after.ok).toBe(true)
  })
  it('a espera dobra a cada erro e para em 15 minutos', () => {
    expect([4, 5, 6, 7, 8, 9, 20].map(waitSeconds)).toEqual([0, 30, 60, 120, 240, 480, 900])
  })
})
