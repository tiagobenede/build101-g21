const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 6

const hits = new Map<string, number[]>()

/** Rate limit en memoria por clave (suficiente para la demo; en prod usar Redis/Upstash). */
export function allowRequest(key: string, maxPerMinute: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= maxPerMinute) {
    hits.set(key, recent)
    return false
  }
  hits.set(key, [...recent, now])
  return true
}

/** Sesiones de voz por usuario: 6 por minuto. */
export function allowSessionMint(userId: string, now = Date.now()): boolean {
  return allowRequest(`session:${userId}`, MAX_PER_WINDOW, now)
}
