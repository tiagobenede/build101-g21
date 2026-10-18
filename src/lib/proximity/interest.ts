import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo"
import { INTEREST_TAGS } from "@/lib/agent/rank"
import type { JevChoice } from "@/lib/jev"
import { PROXIMITY } from "@/lib/tuning"

import type { Candidate } from "./rules"

/**
 * Avisos por gustos (C-6): hay muchos lugares a menos de 100 m que "van con tus
 * gustos", así que no se avisa de todos. Jev elige si alguno vale la pena ahora (o
 * "ninguno") mirando el contexto del viajero. Acá lo puro; la llamada está en `engine.ts`.
 */

// Umbrales: se cambian en src/lib/tuning.ts (o por variable de entorno).
export const MIN_INTEREST_CONFIDENCE = PROXIMITY.minInterestConfidence
export const MAX_INTEREST_OPTIONS = PROXIMITY.maxInterestOptions
export const MIN_INTEREST_REVIEWS = PROXIMITY.minInterestReviews
export const SAME_POINT_METERS = PROXIMITY.samePointMeters
export const PART_OF_METERS = PROXIMITY.partOfMeters
/** Para que uno "se trague" a otro en el mismo punto, tiene que tener tantas veces más reseñas. */
const MUCH_BETTER_KNOWN = 10
export const NONE_KEY = "ninguno"

export type InterestPlace = Candidate & {
  kind: "interest"
  rating: number | null
  /** Reseñas en Google; null si no se sabe. */
  ratingCount?: number | null
  description: string | null
}

/** Un lugar de la zona, para ver si un candidato es parte de él (no hace falta que vaya con sus gustos). */
export type ParentPlace = LatLng & { placeId: string; name: string; category?: string | null; rating: number | null; ratingCount?: number | null }

/** Reseñas de un lugar: sin puntaje ni reseñas, nadie lo reseñó; con puntaje pero sin el dato, no se sabe. */
const reviews = (p: ParentPlace) => p.ratingCount ?? (p.rating === null ? 0 : null)

/** Palabras que no identifican a un lugar ("Musée", "Galerie"): no alcanzan para decir que es parte de otro. */
const GENERIC_WORDS = new Set([
  "museo", "musee", "museum", "galerie", "galeria", "gallery", "jardin", "garden", "parque", "plaza", "place",
  "iglesia", "eglise", "church", "restaurante", "restaurant", "boutique", "store", "tienda", "paris", "nacional",
  "national", "palais", "palacio", "pavillon", "centre", "centro", "grand", "petit", "saint", "sainte",
])
/** Palabras propias del nombre: sin tildes, de 5 letras o más y que no sean genéricas. */
const ownWords = (name: string) =>
  new Set(
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w))
  )

/** `p` es parte de `other`: mucho menos conocido y en el mismo punto, o cerca, del mismo tipo y con su nombre. */
function isPartOf(p: ParentPlace, other: ParentPlace): boolean {
  if (other.placeId === p.placeId || (reviews(other) ?? 0) < MUCH_BETTER_KNOWN * Math.max(reviews(p) ?? 0, 1)) return false
  const meters = distanceMeters(p, other)
  if (meters <= SAME_POINT_METERS) return true
  if (meters > PART_OF_METERS || !p.category || p.category !== other.category) return false
  const mine = ownWords(p.name)
  return [...ownWords(other.name)].some((w) => mine.has(w))
}

/**
 * Lo que vale la pena mostrarle a Jev: Google tiene fichas duplicadas o vacías (un
 * "Museo del Louvre" con 1 reseña) y partes de un lugar listadas aparte (las salas del
 * Louvre). Si van como opciones separadas, Jev reparte la confianza entre lo mismo.
 */
export function distinctInterestPlaces(places: readonly InterestPlace[], parents: readonly ParentPlace[] = places): InterestPlace[] {
  const known = places.filter((p) => {
    const n = reviews(p)
    return n === null || n >= MIN_INTEREST_REVIEWS
  })
  return known.filter((p) => !parents.some((other) => isPartOf(p, other)))
}

export type TravelerSnapshot = {
  interests: string[]
  /** "dieta: vegetariano; movilidad: sin escaleras; presupuesto: 60 € por día", o null. */
  constraints: string | null
  profileSummary: string | null
  localTime: string
  whereLabel: string
  /** Plan de hoy en líneas cortas: "16:00 Marché des Enfants Rouges (pendiente)". */
  todayPlan: string[]
  /** "Clase de cocina a las 18:00 (reserva, en 75 min)", o null. */
  nextCommitment: string | null
}

export const INTEREST_INSTRUCTIONS =
  "El viajero va caminando. ¿Vale la pena interrumpirlo AHORA con un aviso sobre alguno de estos lugares que tiene a menos de 100 m? " +
  "Elegí uno solo si encaja muy bien con sus gustos y restricciones y si tiene tiempo para ir antes de su próximo compromiso. " +
  "Es mejor no avisar que avisar algo mediocre: si no hay uno claramente bueno, elegí 'ninguno'."

export function buildInterestQuestion(places: readonly InterestPlace[], position: LatLng, t: TravelerSnapshot) {
  const options = new Map(places.slice(0, MAX_INTEREST_OPTIONS).map((p, i) => [`p${i + 1}`, p]))
  const criteria: Record<string, string> = {}
  for (const [key, p] of options) {
    const rating = p.rating ? `, ★${p.rating}` : ""
    const about = p.description ? `: ${p.description.slice(0, 140).replace(/[.\s]+$/, "")}` : ""
    // Un gusto propio ("louvre", "mcdonald's") lo dijo con esas palabras: es justo lo que quiere.
    const named = (p.matchedTags ?? []).filter((t) => !(INTEREST_TAGS as readonly string[]).includes(t))
    const asked = named.length > 0 ? ` Le dijo a Polo que le gusta "${named.join('", "')}": es justo esto.` : ""
    criteria[key] = `${p.name} (${p.category ?? "lugar"}${rating}, a ${formatDistance(distanceMeters(position, p))})${about}. Va con: ${p.matchedTags?.join(", ") || "-"}.${asked}`
  }
  criteria[NONE_KEY] = "Ninguno vale un aviso ahora."

  const state = {
    viajero: {
      gustos: t.interests,
      restricciones_no_negociables: t.constraints ?? "ninguna",
      lo_que_sabemos: t.profileSummary ?? "nada más",
    },
    ahora: { hora_local: t.localTime, donde: t.whereLabel },
    plan_de_hoy: t.todayPlan.length > 0 ? t.todayPlan : ["nada planeado"],
    proximo_compromiso: t.nextCommitment ?? "ninguno",
  }
  return { state, criteria, options }
}

/** El lugar que eligió Jev, o null si dijo "ninguno" o no está seguro. */
export function readInterestChoice(answer: JevChoice, options: ReadonlyMap<string, InterestPlace>): InterestPlace | null {
  if (answer.choice === NONE_KEY || answer.confidence < MIN_INTEREST_CONFIDENCE) return null
  return options.get(answer.choice) ?? null
}

/** Mismas opciones que la última vez → no se vuelve a preguntar (cada ping es cada 5 s). */
export const optionsSignature = (places: readonly InterestPlace[]) =>
  places
    .slice(0, MAX_INTEREST_OPTIONS)
    .map((p) => p.placeId)
    .sort()
    .join("|")
