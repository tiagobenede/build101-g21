import { createBrowserClient } from "@supabase/ssr"

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env"

let client: ReturnType<typeof createBrowserClient> | null = null

/** Cliente del navegador (una sola instancia): para escuchar cambios con Supabase Realtime. */
export function getBrowserClient() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  return client
}

/**
 * Escucha los cambios de una tabla con los permisos del usuario. El token se pasa
 * antes de suscribirse: sin él, RLS filtra todos los eventos sin avisar.
 * Devuelve la función para dejar de escuchar.
 */
export async function onTableChange(table: string, onChange: () => void): Promise<() => void> {
  const db = getBrowserClient()
  const {
    data: { session },
  } = await db.auth.getSession()
  if (session) await db.realtime.setAuth(session.access_token)

  const channel = db
    .channel(`${table}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe((status: string, err?: Error) => {
      if (status !== "SUBSCRIBED") console.warn(`[realtime] ${table}`, status, err?.message ?? "")
    })
  return () => void db.removeChannel(channel)
}
