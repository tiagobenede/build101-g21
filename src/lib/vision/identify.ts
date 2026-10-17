import "server-only"

import type { PlaceCard } from "@/hooks/voice-session-types"
import type { TravelerContext } from "@/lib/data/session"
import { distanceMeters } from "@/lib/geo"
import { searchPlaces } from "@/lib/places/search"

import { buildJevOptions, pickCandidates, readJevChoice } from "./choose"
import { describePhoto } from "./describe"
import { askJev, type Photo } from "./jev"

/**
 * "¿Qué estoy viendo?" (C-3).
 * 1. Jev elige entre los lugares a menos de 250 m o "ninguno" (rápido y barato).
 * 2. Si dice "ninguno", duda o falla: un LLM con visión mira la foto con el contexto
 *    de ubicación, sin opciones.
 * 3. Si el LLM nombra un lugar concreto, se busca en Google cerca para anclarlo a
 *    `places`, así se puede sumar al plan igual que lo que elige Jev.
 */

/** Lo que encuentra Text Search más lejos que esto no es lo de la foto. */
const ANCHOR_MAX_METERS = 1_000

export type VisionResult = {
  /** Qué camino respondió: sirve para el panel de demo y para ajustar el umbral. */
  via: "jev" | "llm"
  name: string
  /** Para mostrar y para que el agente lo cuente (A-4). */
  description: string | null
  /** Confianza de Jev; null cuando respondió el LLM. */
  confidence: number | null
  /** Lugar de `places` (para "Agregar al plan"); null si no se pudo anclar. */
  place: PlaceCard | null
}

const logError = (step: string) => (err: unknown) => {
  console.error(`[vision] ${step}`, err instanceof Error ? err.message : err)
  return null
}

export async function identifyPhoto(photo: Photo, ctx: TravelerContext): Promise<VisionResult> {
  const candidates = pickCandidates(ctx.nearby)
  if (candidates.length > 0) {
    const { criteria, places } = buildJevOptions(candidates)
    const answer = await askJev(photo, ctx.locationLabel, criteria).catch(logError("jev"))
    const picked = answer && readJevChoice(answer, places)
    if (picked) {
      const p = picked.place
      return {
        via: "jev",
        name: p.name,
        description: p.description ?? p.category,
        confidence: picked.confidence,
        place: {
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          walkMinutes: p.walkMinutes,
          stayMinutes: p.typical_visit_minutes,
        },
      }
    }
  }

  const city = ctx.trip?.destination ?? null
  const seen = await describePhoto(photo, { label: ctx.locationLabel, city, location: ctx.location })

  let place: PlaceCard | null = null
  if (seen.searchable && seen.name) {
    const found = await searchPlaces(seen.name, null, ctx.location, city ?? "París").catch(logError("anchor"))
    const match = found?.find((f) => distanceMeters(ctx.location, f) <= ANCHOR_MAX_METERS)
    if (match) {
      place = {
        id: match.id,
        name: match.name,
        category: match.category,
        description: match.description,
        walkMinutes: match.walkMinutes,
        stayMinutes: match.typical_visit_minutes,
      }
    }
  }

  return { via: "llm", name: place?.name ?? seen.name, description: seen.description, confidence: null, place }
}
