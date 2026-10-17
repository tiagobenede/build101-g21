import type { NearbyPlace } from "@/lib/data/session"

const byDistance = (a: NearbyPlace, b: NearbyPlace) => a.distanceMeters - b.distanceMeters
const byFame = (a: NearbyPlace, b: NearbyPlace) => (b.rating_count ?? 0) - (a.rating_count ?? 0) || byDistance(a, b)

/** Turno a turno: el más cercano, el más conocido, el segundo más cercano, … sin repetir. */
function interleave(places: NearbyPlace[]): NearbyPlace[] {
  const near = [...places].sort(byDistance)
  const famous = [...places].sort(byFame)
  const seen = new Set<string>()
  const out: NearbyPlace[] = []
  for (let i = 0; i < places.length; i++) {
    for (const p of [near[i], famous[i]]) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        out.push(p)
      }
    }
  }
  return out
}

/**
 * Los lugares que van en las instrucciones: turnos por rubro para que 20 restaurantes de la
 * cuadra no tapen el shopping o el parque, y dentro de cada rubro se alternan el más cercano y
 * el más conocido (reseñas en Google): el café de la esquina y el shopping del barrio. Sale
 * ordenado por distancia.
 */
export function pickContextPlaces(nearby: NearbyPlace[], max: number): NearbyPlace[] {
  const byCategory = new Map<string, NearbyPlace[]>()
  for (const p of nearby) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p])
  const queues = [...byCategory.values()].map(interleave)
  const picked: NearbyPlace[] = []
  for (let round = 0; picked.length < max && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      if (picked.length < max && q[round]) picked.push(q[round])
    }
  }
  return picked.sort(byDistance)
}
