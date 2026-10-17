import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env"

let client: SupabaseClient | null = null

/** Cliente de Supabase para el navegador (sesión por cookies). Una sola instancia. */
export function createClient(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  return client
}

/**
 * Escucha los cambios de una tabla con los permisos del usuario. Realtime aplica RLS
 * con el token del usuario: hay que pasárselo antes de suscribirse, si no el canal
 * entra como anónimo y no llega ningún cambio. Devuelve la función para dejar de escuchar.
 */
export async function onTableChange(table: string, onChange: () => void): Promise<() => void> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) await supabase.realtime.setAuth(session.access_token)

  const channel = supabase
    .channel(`${table}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe((status: string, err?: Error) => {
      if (status !== "SUBSCRIBED") console.warn(`[realtime] ${table}`, status, err?.message ?? "")
    })
  return () => void supabase.removeChannel(channel)
}
