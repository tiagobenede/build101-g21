import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env"

let client: SupabaseClient | null = null

/** Cliente de Supabase para el navegador (sesión por cookies). Una sola instancia. */
export function createClient(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  return client
}
