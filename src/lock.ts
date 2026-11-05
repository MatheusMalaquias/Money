/**
 * Bloqueio do app por PIN.
 *
 * O PIN nunca é guardado: só um resumo irreversível (PBKDF2-SHA256 com sal aleatório e 150 mil voltas).
 * É uma trava de tela para quem pegar o aparelho; os dados continuam no IndexedDB sem criptografia.
 */
const KEY = 'money.lock'
export const PIN_RE = /^\d{4,8}$/
const ITERATIONS = 150_000
const FREE_TRIES = 5

export interface LockRecord {
  salt: string
  hash: string
  iterations: number
  /** Erros seguidos (zera ao acertar). */
  fails: number
  /** Só tenta de novo depois deste instante (ms). */
  until: number
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256))
}

/** Comparação em tempo constante: não revela em qual posição o resumo começa a diferir. */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function createLock(pin: string, iterations = ITERATIONS): Promise<LockRecord> {
  if (!PIN_RE.test(pin)) throw new Error('O PIN deve ter de 4 a 8 números.')
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return { salt: b64(salt), hash: b64(await derive(pin, salt, iterations)), iterations, fails: 0, until: 0 }
}

/** Segundos de espera depois de errar demais: 5 tentativas livres, depois 30 s, 1 min, 2 min… até 15 min. */
export function waitSeconds(fails: number): number {
  return fails < FREE_TRIES ? 0 : Math.min(900, 30 * 2 ** (fails - FREE_TRIES))
}

export type VerifyResult = { ok: true; record: LockRecord } | { ok: false; record: LockRecord; waitSeconds: number }

/** Confere o PIN respeitando a espera. Devolve o registro atualizado (erros e espera) para ser salvo. */
export async function verifyPin(pin: string, rec: LockRecord, now = Date.now()): Promise<VerifyResult> {
  if (now < rec.until) return { ok: false, record: rec, waitSeconds: Math.ceil((rec.until - now) / 1000) }
  const good = same(await derive(pin, unb64(rec.salt), rec.iterations), unb64(rec.hash))
  if (good) return { ok: true, record: { ...rec, fails: 0, until: 0 } }
  const fails = rec.fails + 1
  const wait = waitSeconds(fails)
  return { ok: false, record: { ...rec, fails, until: wait ? now + wait * 1000 : 0 }, waitSeconds: wait }
}

export function loadLock(): LockRecord | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as LockRecord
    return typeof r.salt === 'string' && typeof r.hash === 'string' && Number.isInteger(r.iterations) ? r : null
  } catch {
    return null
  }
}

export function saveLock(rec: LockRecord | null): void {
  try {
    if (rec) localStorage.setItem(KEY, JSON.stringify(rec))
    else localStorage.removeItem(KEY)
  } catch {
    /* armazenamento indisponível */
  }
}

/** "Esqueci o PIN": apaga os dados deste aparelho e o bloqueio. Quem tem backup importa depois. */
export async function wipeEverything(): Promise<void> {
  saveLock(null)
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('money')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}
