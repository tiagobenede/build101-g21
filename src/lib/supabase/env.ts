function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Copiá .env.example a .env.local.`)
  }
  return value
}

export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)
export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Nombre de la cookie de sesión. supabase-js lo arma con el host de la URL
 * ("sb-127-auth-token"); se fija acá para que el navegador use la misma cookie que el
 * server aunque le hable a Supabase por otra URL (ver `browserSupabaseUrl`).
 */
export const SUPABASE_AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`

/**
 * URL de Supabase para el navegador. Con Supabase local y la app abierta desde otro
 * lado (un túnel HTTPS para probar en el celular), `127.0.0.1` sería el propio celular:
 * se usa `/supabase` en el mismo dominio, que Next reenvía al Supabase local
 * (`rewrites` en next.config.ts, también los WebSockets de Realtime).
 */
export function browserSupabaseUrl(): string {
  if (typeof window === "undefined") return SUPABASE_URL
  const supabaseIsLocal = LOCAL_HOSTS.has(new URL(SUPABASE_URL).hostname)
  return supabaseIsLocal && !LOCAL_HOSTS.has(window.location.hostname) ? `${window.location.origin}/supabase` : SUPABASE_URL
}
