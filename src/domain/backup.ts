import { CURRENCIES, type Settings } from './types'
import { STORE_NAMES, type Snapshot } from '../storage/types'

export const BACKUP_APP = 'money'
export const BACKUP_VERSION = 1

export interface BackupFile extends Snapshot {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
}

export const buildBackup = (snap: Snapshot, now: string): BackupFile => ({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, ...snap })

export const backupFileName = (today: string) => `money-backup-${today}.json`

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown) => typeof v === 'string'
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v)
const isCur = (v: unknown) => CURRENCIES.includes(v as never)

/** Campos obrigatórios de cada coleção: barra arquivo errado ou corrompido antes de apagar os dados atuais. */
const SHAPES: Record<string, Record<string, (v: unknown) => boolean>> = {
  categories: { id: isStr, nome: isStr, cor: isStr, ordem: isInt },
  bills: { id: isStr, descricao: isStr, valorCents: isInt, moeda: isCur, vencimento: isStr, diaAncora: isInt, categoriaId: isStr, pessoa: isStr, recorrencia: isStr, status: isStr, serieId: isStr },
  transactions: { id: isStr, tipo: isStr, valorCents: isInt, moeda: isCur, data: isStr, categoriaId: isStr, pessoa: isStr, cambio: isObj },
  goals: { id: isStr, nome: isStr, alvoCents: isInt, atualCents: isInt, moeda: isCur, pessoa: isStr },
  rules: { id: isStr, nome: isStr, basisPoints: isInt },
}

/** Lê e valida um backup. Lança Error com mensagem em português se algo estiver errado. */
export function parseBackup(text: string): Snapshot {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) throw new Error('Este arquivo não é um backup do Money.')
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) throw new Error('Backup de uma versão mais nova do app. Atualize o app e tente de novo.')
  if (!isObj(raw.data)) throw new Error('Backup sem dados.')

  const data = {} as Snapshot['data']
  for (const name of STORE_NAMES) {
    const list = (raw.data as Record<string, unknown>)[name] ?? []
    if (!Array.isArray(list)) throw new Error(`Backup inválido: "${name}" deveria ser uma lista.`)
    list.forEach((item, i) => {
      if (!isObj(item)) throw new Error(`Backup inválido: item ${i + 1} de "${name}".`)
      for (const [field, ok] of Object.entries(SHAPES[name])) {
        if (!ok(item[field])) throw new Error(`Backup inválido: campo "${field}" no item ${i + 1} de "${name}".`)
      }
    })
    ;(data as Record<string, unknown>)[name] = list
  }

  let settings: Settings | null = null
  if (raw.settings !== null && raw.settings !== undefined) {
    const s = raw.settings
    if (!isObj(s) || !isCur(s.moedaExibicao) || !Array.isArray(s.pessoas) || !isObj(s.rates) || !isObj(s.rates.perUSD)) throw new Error('Backup inválido: configurações.')
    settings = s as unknown as Settings
  }
  return { data, settings }
}
