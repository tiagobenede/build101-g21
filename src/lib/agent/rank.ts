/**
 * Ranking de lugares cercanos para el tool `recommend_nearby`: gustos × distancia
 * × qué tan conocido es × tiempo libre × próximo compromiso. Puro, sin base de datos, para testearlo solo.
 */
import { walkMinutes as walkBetween, type LatLng } from "@/lib/geo"
import { matchInterests } from "@/lib/profile/interests"

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
export type InterestTag = (typeof INTEREST_TAGS)[number]

/** Para comer o tomar algo se camina poco: por defecto, solo lo que está cerca. */
export const NEAR_ONLY_TAGS: readonly InterestTag[] = ["comida", "café"]

/** Restricciones de comida que el ranking sabe respetar (con los tipos de Google). */
export const DIETS = ["vegetariano", "vegano", "sin gluten", "sin lactosa", "halal", "kosher"] as const
export type Diet = (typeof DIETS)[number]

/** Tipos de Google que chocan con una dieta: esos lugares no se recomiendan. */
const DIET_EXCLUDES: Partial<Record<Diet, string[]>> = {
  vegetariano: ["steak_house", "barbecue_restaurant", "seafood_restaurant"],
  vegano: ["steak_house", "barbecue_restaurant", "seafood_restaurant"],
}
/** Tipos de Google que van muy bien con una dieta: suben en el ranking. */
const DIET_BOOSTS: Partial<Record<Diet, string[]>> = {
  vegetariano: ["vegetarian_restaurant", "vegan_restaurant"],
  vegano: ["vegan_restaurant"],
}
const DIET_BOOST = 6

/** `rating_count`: reseñas en Google (qué tan conocido es); null si no se sabe. */
export type RankablePlace = Place & { walkMinutes: number; googleTypes?: string[]; rating_count?: number | null }

/** Sin dato de reseñas, cuenta como un lugar con ~100 (ni muy conocido ni desconocido). */
const UNKNOWN_FAME = 2
/** log10 de las reseñas: 20 → 1,3; 1.000 → 3; 50.000 → 4,7. */
const fame = (ratingCount: number | null | undefined) => (ratingCount == null ? UNKNOWN_FAME : Math.log10(ratingCount + 1))
const FAME_WEIGHT = 1.5
/** Si pidió algo puntual ("compras"), manda el pedido: que coincida con sus gustos solo desempata. */
const PROFILE_TIEBREAK = 0.5

export type Ranked = {
  place: RankablePlace
  walkMinutes: number
  stayMinutes: number
  matchedTags: string[]
  score: number
  /** Con un próximo compromiso con lugar: minutos a pie desde acá hasta él. */
  walkToNextMinutes: number | null
}

export type RankInput = {
  places: RankablePlace[]
  /** Gustos del viajero, el más importante primero. */
  interests: string[]
  /** Lo que pidió ahora ("tengo hambre" → comida). Si viene, es obligatorio. */
  requestedTag: string | null
  availableMinutes: number
  alreadyRecommended: string[]
  /** Minutos a pie como mucho: más lejos no se recomienda. */
  maxWalkMinutes: number
  /** Dietas del viajero (`profiles.dietary`); las que no conocemos se ignoran acá y van en las instrucciones. */
  dietary?: string[]
  /** Cuántos devolver (por defecto MAX_RECOMMENDATIONS). */
  limit?: number
  /** Dónde es el próximo compromiso y a cuántos minutos queda yendo derecho: lo que se recomiende tiene que quedar de camino. */
  nextStop?: (LatLng & { walkMinutes: number }) | null
}

/** Cada minuto que el lugar lo desvía de camino al compromiso resta esto del puntaje. */
const DETOUR_WEIGHT = 1 / 4

/**
 * Minutos libres: lo que dijo, o hasta el próximo compromiso con margen, o una hora por
 * defecto. Si dijo cuánto tiene y el compromiso llega antes, manda el compromiso.
 */
export function resolveAvailableMinutes(stated: number | null, nextCommitmentAt: Date | null, now: Date): number {
  const untilCommitment = nextCommitmentAt
    ? Math.max(0, Math.floor((nextCommitmentAt.getTime() - now.getTime()) / 60_000) - COMMITMENT_BUFFER_MINUTES)
    : null
  if (stated !== null) return Math.max(0, Math.min(stated, untilCommitment ?? stated))
  return untilCommitment ?? DEFAULT_AVAILABLE_MINUTES
}

/** El primer gusto pesa más: 2^(n-i). */
function interestWeights(interests: string[]): Map<string, number> {
  return new Map(interests.map((tag, i) => [tag, 2 ** (interests.length - i)]))
}

/** Lo ya recomendado en la conversación queda al final: solo vuelve si no hay otra cosa. */
export function rankPlaces({
  places,
  interests,
  requestedTag,
  availableMinutes,
  alreadyRecommended,
  maxWalkMinutes,
  dietary = [],
  limit = MAX_RECOMMENDATIONS,
  nextStop = null,
}: RankInput): Ranked[] {
  const weights = interestWeights(interests)
  const diets = dietary.filter((d): d is Diet => (DIETS as readonly string[]).includes(d))
  const excluded = new Set(diets.flatMap((d) => DIET_EXCLUDES[d] ?? []))
  const boosted = new Set(diets.flatMap((d) => DIET_BOOSTS[d] ?? []))
  return places
    .filter((p) => p.walkMinutes <= maxWalkMinutes)
    .filter((p) => !requestedTag || p.tags.includes(requestedTag))
    .filter((p) => !p.googleTypes?.some((t) => excluded.has(t)))
    .map((place) => {
      const walk = place.walkMinutes
      // Con un compromiso después: el tiempo también tiene que alcanzar para llegar de ahí a él,
      // y cuenta lo que se desvía del camino (ir derecho vs. pasar por el lugar).
      const walkToNext = nextStop ? walkBetween(place, nextStop) : 0
      const detour = nextStop ? Math.max(0, walk + walkToNext - nextStop.walkMinutes) : 0
      const stay = Math.min(place.typical_visit_minutes, availableMinutes - walk - walkToNext)
      // Gustos de la lista y propios ("mcdonald's" coincide por nombre), más lo que pidió ahora.
      const liked = matchInterests(place, interests)
      const matchedTags = requestedTag && !liked.includes(requestedTag) ? [...liked, requestedTag] : liked
      const profileScore = matchedTags.reduce((sum, t) => sum + (weights.get(t) ?? 0), 0)
      const interestScore = requestedTag ? (profileScore > 0 ? PROFILE_TIEBREAK : 0) : profileScore
      const penalty = alreadyRecommended.includes(place.id) ? 100 : 0
      const dietBoost = place.googleTypes?.some((t) => boosted.has(t)) ? DIET_BOOST : 0
      const distance = walk / 10 + detour * DETOUR_WEIGHT
      const score = interestScore + dietBoost + (place.rating ?? 4) + FAME_WEIGHT * fame(place.rating_count) - distance - penalty
      return { place, walkMinutes: walk, stayMinutes: stay, matchedTags, score, walkToNextMinutes: nextStop ? walkToNext : null }
    })
    .filter((r) => r.stayMinutes >= MIN_STAY_MINUTES && r.matchedTags.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
