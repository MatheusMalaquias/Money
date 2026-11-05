import type { SupabaseClient } from '@supabase/supabase-js'
import type { Remote, RemoteRow } from './sync'

const fail = (e: { message: string }): never => {
  throw new Error(e.message)
}

/** A nuvem do Money no Supabase: a tabela money_records de um espaço (household). */
export function createSupabaseRemote(client: SupabaseClient, householdId: string): Remote {
  return {
    async pull(after, limit) {
      let q = client.from('money_records').select('store,id,data,deleted,updated_at').eq('household_id', householdId)
      if (after) q = q.gt('updated_at', after)
      const { data, error } = await q.order('updated_at', { ascending: true }).limit(limit)
      if (error) fail(error)
      return (data ?? []) as RemoteRow[]
    },
    async push(rows) {
      if (!rows.length) return
      const { error } = await client.from('money_records').upsert(
        rows.map((r) => ({ household_id: householdId, store: r.store, id: r.id, data: r.data, deleted: r.deleted })),
        { onConflict: 'household_id,store,id' }
      )
      if (error) fail(error)
    },
    async wipe() {
      const { error } = await client.from('money_records').delete().eq('household_id', householdId)
      if (error) fail(error)
    },
  }
}

/** Avisa quando algo muda no espaço (o outro celular gravou): o app então sincroniza. Devolve a função que cancela. */
export function subscribeToHousehold(client: SupabaseClient, householdId: string, onChange: () => void): () => void {
  const channel = client
    .channel(`money-${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'money_records', filter: `household_id=eq.${householdId}` }, onChange)
    .subscribe()
  return () => void client.removeChannel(channel)
}
