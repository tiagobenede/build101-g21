import type { NearbyPlace } from "@/lib/data/session"

/** Solo lo que está a la vista: más lejos no puede ser lo que sale en la foto. */
export const CANDIDATE_RADIUS_METERS = 250
/** Cada opción se lee como tokens de entrada; más de esto no mejora la precisión. */
export const MAX_CANDIDATES = 8
/** Por debajo, Jev no está seguro y se le pregunta al LLM. Ajustar con las fotos de la demo. */
export const MIN_JEV_CONFIDENCE = 0.5
/** Opción "no es ninguno de estos lugares" (la doc de Jev la recomienda cuando la lista puede no alcanzar). */
export const NONE_KEY = "ninguno"

const MAX_DESCRIPTION_CHARS = 160

/** Los lugares más cercanos que pueden estar en la foto. `nearby` ya viene ordenado por distancia. */
export function pickCandidates(nearby: readonly NearbyPlace[]): NearbyPlace[] {
  return nearby.filter((p) => p.distanceMeters <= CANDIDATE_RADIUS_METERS).slice(0, MAX_CANDIDATES)
}

export type JevOptions = {
  /** Opción → descripción, como lo pide la pregunta `choice` de Jev. */
  criteria: Record<string, string>
  /** Clave corta (p1, p2…) → lugar. A Jev no le mandamos ids de Google. */
  places: Map<string, NearbyPlace>
}

export function buildJevOptions(candidates: readonly NearbyPlace[]): JevOptions {
  const places = new Map(candidates.map((p, i) => [`p${i + 1}`, p]))
  const criteria: Record<string, string> = {}
  for (const [key, p] of places) {
    const about = p.description ? `: ${p.description.slice(0, MAX_DESCRIPTION_CHARS)}` : ""
    criteria[key] = `${p.name} (${p.category})${about}`
  }
  criteria[NONE_KEY] = "Ninguno de estos lugares: la foto muestra otra cosa, o no se puede saber."
  return { criteria, places }
}

export type JevChoice = { choice: string; confidence: number; probabilities?: Record<string, number> }

/** El lugar que eligió Jev, o null si dijo "ninguno" o no está seguro. */
export function readJevChoice(
  answer: JevChoice,
  places: ReadonlyMap<string, NearbyPlace>
): { place: NearbyPlace; confidence: number } | null {
  if (answer.choice === NONE_KEY || answer.confidence < MIN_JEV_CONFIDENCE) return null
  const place = places.get(answer.choice)
  return place ? { place, confidence: answer.confidence } : null
}
