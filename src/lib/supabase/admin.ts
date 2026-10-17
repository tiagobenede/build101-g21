import "server-only"

import { createClient } from "@supabase/supabase-js"

import { SUPABASE_URL } from "./env"

/**
 * Cliente con la key secreta: saltea los permisos por usuario. Solo para datos
 * compartidos que escribe el server (el cache de `places`), nunca con datos del usuario.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY en .env.local (`npx supabase status` la muestra).")
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
