import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Sem as duas variáveis o app funciona só local, como antes. A chave "anon" é pública: quem protege os dados é o RLS do money.sql. */
export const cloudConfigured = Boolean(url && key)

let client: SupabaseClient | null = null
export const getClient = (): SupabaseClient => (client ??= createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }))
