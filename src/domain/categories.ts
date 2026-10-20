import type { Category } from './types'

/**
 * Une categorias com o mesmo nome (sem diferenciar maiúsculas). Fica a que mais é usada (depois a de menor ordem)
 * e `remap` diz para qual id cada duplicada deve ser trocada nas contas, lançamentos e metas.
 * Corrige bases em que o carregamento inicial rodou duas vezes e criou as categorias em dobro.
 */
export function dedupeCategories(cats: Category[], usage: Map<string, number>): { keep: Category[]; remap: Map<string, string> } {
  const groups = new Map<string, Category[]>()
  for (const c of cats) {
    const key = c.chave ?? c.nome.trim().toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const remap = new Map<string, string>()
  const keep: Category[] = []
  for (const group of groups.values()) {
    const [winner, ...rest] = [...group].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.ordem - b.ordem || a.id.localeCompare(b.id))
    keep.push(winner)
    for (const r of rest) remap.set(r.id, winner.id)
  }
  return { keep, remap }
}
