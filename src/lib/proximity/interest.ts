import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo"
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
export const NONE_KEY = "ninguno"

export type InterestPlace = Candidate & { kind: "interest"; rating: number | null; description: string | null }

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
    criteria[key] = `${p.name} (${p.category ?? "lugar"}${rating}, a ${formatDistance(distanceMeters(position, p))})${about}. Va con: ${p.matchedTags?.join(", ") || "-"}.`
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
