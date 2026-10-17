const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 6

const hits = new Map<string, number[]>()

/** Rate limit en memoria por usuario (suficiente para la demo; en prod usar Redis/Upstash). */
export function allowSessionMint(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent)
    return false
  }
  hits.set(userId, [...recent, now])
  return true
}
