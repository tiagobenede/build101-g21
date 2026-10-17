import { createBrowserClient } from "@supabase/ssr"
import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js"

import { browserSupabaseUrl, SUPABASE_AUTH_COOKIE, SUPABASE_PUBLISHABLE_KEY } from "./env"

let client: SupabaseClient | null = null

/** Cliente de Supabase para el navegador (sesión por cookies). Una sola instancia. */
export function createClient(): SupabaseClient {
  client ??= createBrowserClient(browserSupabaseUrl(), SUPABASE_PUBLISHABLE_KEY, { cookieOptions: { name: SUPABASE_AUTH_COOKIE } })
  return client
}

/**
 * Escucha los cambios de una tabla con los permisos del usuario. Realtime aplica RLS
 * con el token del usuario: hay que pasárselo antes de suscribirse, si no el canal
 * entra como anónimo y no llega ningún cambio. Devuelve la función para dejar de escuchar.
 */
/** Cambio de una fila: `new` en altas y cambios, `old` (solo la clave) en bajas. */
export type TableChange = RealtimePostgresChangesPayload<Record<string, unknown>>

export async function onTableChange(table: string, onChange: (change: TableChange) => void): Promise<() => void> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) await supabase.realtime.setAuth(session.access_token)

  const channel = supabase
    // crypto.randomUUID solo existe en HTTPS (o localhost): por la IP de la red no.
    .channel(`${table}:${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe((status: string, err?: Error) => {
      if (status !== "SUBSCRIBED") console.warn(`[realtime] ${table}`, status, err?.message ?? "")
    })
  return () => void supabase.removeChannel(channel)
}
