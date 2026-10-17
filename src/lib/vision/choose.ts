import type { NearbyPlace } from "@/lib/data/session"
import type { JevChoice } from "@/lib/jev"
import { VISION } from "@/lib/tuning"

// Umbrales: se cambian en src/lib/tuning.ts (o por variable de entorno).
export const CANDIDATE_RADIUS_METERS = VISION.candidateRadiusMeters
export const MAX_CANDIDATES = VISION.maxCandidates
export const MIN_JEV_CONFIDENCE = VISION.minJevConfidence
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

export type { JevChoice }

/** El lugar que eligió Jev, o null si dijo "ninguno" o no está seguro. */
export function readJevChoice(
  answer: JevChoice,
  places: ReadonlyMap<string, NearbyPlace>
): { place: NearbyPlace; confidence: number } | null {
  if (answer.choice === NONE_KEY || answer.confidence < MIN_JEV_CONFIDENCE) return null
  const place = places.get(answer.choice)
  return place ? { place, confidence: answer.confidence } : null
}
