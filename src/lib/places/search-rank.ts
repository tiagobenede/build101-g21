/**
 * Qué resultados de Google Text Search se muestran, parecido a Google Maps: sin cerrados,
 * una sola sucursal por nombre y, cuando se busca un tipo de lugar ("farmacia", "café"),
 * lo cercano y bien puntuado primero. Puro, para testearlo solo.
 */

export type SearchCandidate = {
  id: string
  name: string
  walkMinutes: number
  rating: number | null
  ratingCount: number | null
  /** `businessStatus` de Google: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY (o null). */
  status: string | null
}

/** Rating "a priori" y cuántas reseñas pesa: un 5★ con 3 reseñas no le gana a un 4,6★ con 2.000. */
const PRIOR_RATING = 4
const PRIOR_REVIEWS = 10
/** Por debajo de esto (ya ajustado) es un lugar flojo: solo entra si no hay suficientes buenos. */
const WEAK_RATING = 3.5
const QUALITY_WEIGHT = 2
/** Qué tan conocido es (log10 de reseñas): 100 → 1, 10.000 → 2. */
const FAME_WEIGHT = 0.5
/** Cada minuto a pie resta: 4 min de más equivalen a medio punto de rating. */
const WALK_WEIGHT = 0.25

const normalizedName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()

/** Rating ajustado por cantidad de reseñas (promedio bayesiano). */
function quality(p: SearchCandidate): number {
  const count = p.ratingCount ?? 0
  if (p.rating === null || count === 0) return PRIOR_RATING
  return (p.rating * count + PRIOR_RATING * PRIOR_REVIEWS) / (count + PRIOR_REVIEWS)
}

function score(p: SearchCandidate): number {
  return QUALITY_WEIGHT * quality(p) + FAME_WEIGHT * Math.log10((p.ratingCount ?? 0) + 1) - WALK_WEIGHT * p.walkMinutes
}

/** La más cercana de cada nombre (las cadenas tienen varias sucursales a pocas cuadras). */
function oneBranchPerName<T extends SearchCandidate>(places: T[]): T[] {
  const best = new Map<string, T>()
  for (const p of places) {
    const key = normalizedName(p.name)
    const current = best.get(key)
    if (!current || p.walkMinutes < current.walkMinutes) best.set(key, p)
  }
  // Mantiene el orden original (el de Google) entre los que quedan.
  return places.filter((p) => best.get(normalizedName(p.name)) === p)
}

/**
 * `byName`: buscó un lugar puntual ("el Louvre") y el primero de Google es ese, así que se
 * respeta su orden. Si no, buscó un tipo de lugar y se ordena por cercanía y calidad.
 */
export function pickSearchResults<T extends SearchCandidate>(places: T[], { byName, max }: { byName: boolean; max: number }): T[] {
  const open = places.filter((p) => !p.status || p.status === "OPERATIONAL")
  const unique = oneBranchPerName(open)
  if (byName) return unique.slice(0, max)

  const ranked = [...unique].sort((a, b) => score(b) - score(a))
  const good = ranked.filter((p) => quality(p) >= WEAK_RATING)
  const weak = ranked.filter((p) => quality(p) < WEAK_RATING)
  return [...good, ...weak].slice(0, max)
}
