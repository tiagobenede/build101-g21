/**
 * Ranking de lugares cercanos para el tool `recommend_nearby`: gustos × distancia
 * × tiempo libre × próximo compromiso. Puro, sin base de datos, para testearlo solo.
 */
import type { Place } from "./types"

export const MIN_STAY_MINUTES = 10
export const COMMITMENT_BUFFER_MINUTES = 15
export const DEFAULT_AVAILABLE_MINUTES = 60
export const MAX_RECOMMENDATIONS = 3

/** Tags que existen en `places` y que el agente puede pedir. */
export const INTEREST_TAGS = [
  "autos",
  "arte",
  "diseño",
  "arquitectura",
  "café",
  "historia",
  "libros",
  "comida",
  "mercados",
  "parques",
  "compras",
  "ciencia",
] as const

export type RankablePlace = Place & { walkMinutes: number }

export type Ranked = {
  place: RankablePlace
  walkMinutes: number
  stayMinutes: number
  matchedTags: string[]
  score: number
}

export type RankInput = {
  places: RankablePlace[]
  /** Gustos del viajero, el más importante primero. */
  interests: string[]
  /** Lo que pidió ahora ("tengo hambre" → comida). Si viene, es obligatorio. */
  requestedTag: string | null
  availableMinutes: number
  alreadyRecommended: string[]
}

/**
 * Minutos libres: lo que dijo, o hasta el próximo compromiso con margen,
 * o una hora por defecto.
 */
export function resolveAvailableMinutes(stated: number | null, nextCommitmentAt: Date | null, now: Date): number {
  if (stated !== null) return Math.max(0, stated)
  if (nextCommitmentAt) {
    const until = Math.floor((nextCommitmentAt.getTime() - now.getTime()) / 60_000)
    return Math.max(0, until - COMMITMENT_BUFFER_MINUTES)
  }
  return DEFAULT_AVAILABLE_MINUTES
}

/** El primer gusto pesa más: 2^(n-i). */
function interestWeights(interests: string[]): Map<string, number> {
  return new Map(interests.map((tag, i) => [tag, 2 ** (interests.length - i)]))
}

/** Lo ya recomendado en la conversación queda al final: solo vuelve si no hay otra cosa. */
export function rankPlaces({ places, interests, requestedTag, availableMinutes, alreadyRecommended }: RankInput): Ranked[] {
  const weights = interestWeights(interests)
  return places
    .filter((p) => !requestedTag || p.tags.includes(requestedTag))
    .map((place) => {
      const walk = place.walkMinutes
      const stay = Math.min(place.typical_visit_minutes, availableMinutes - walk)
      const matchedTags = place.tags.filter((t) => weights.has(t) || t === requestedTag)
      const interestScore = matchedTags.reduce((sum, t) => sum + (weights.get(t) ?? 0), 0)
      const penalty = alreadyRecommended.includes(place.id) ? 100 : 0
      const score = interestScore + (place.rating ?? 4) - walk / 10 - penalty
      return { place, walkMinutes: walk, stayMinutes: stay, matchedTags, score }
    })
    .filter((r) => r.stayMinutes >= MIN_STAY_MINUTES && r.matchedTags.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
}
