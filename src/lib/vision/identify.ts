import "server-only"

import type { PlaceCard } from "@/hooks/voice-session-types"
import type { TravelerContext } from "@/lib/data/session"

import { buildJevOptions, pickCandidates, readJevChoice } from "./choose"
import { namePhotoPlace } from "./describe"
import { fitForJev } from "./fit"
import { askJev, type Photo } from "./jev"

/**
 * "¿Qué estoy viendo?" (C-3). Dice qué es; explicarlo o sumarlo al plan lo hace el agente.
 * 1. Jev elige entre los lugares a menos de 250 m o "ninguno" (rápido y barato).
 * 2. Si dice "ninguno", duda o falla: un LLM con visión mira la foto con el contexto
 *    de ubicación, sin opciones, y devuelve solo el nombre.
 */

export type VisionResult = {
  /** Qué camino respondió: sirve para el panel de demo y para ajustar el umbral. */
  via: "jev" | "llm"
  /** Nombre del lugar; null si no se pudo identificar. */
  name: string | null
  /** Descripción de Google cuando respondió Jev; null con el LLM (la cuenta el agente). */
  description: string | null
  /** Confianza de Jev; null cuando respondió el LLM. */
  confidence: number | null
  /** Lugar de `places` (para "Agregar al plan") cuando respondió Jev; null con el LLM. */
  place: PlaceCard | null
}

export async function identifyPhoto(photo: Photo, ctx: TravelerContext): Promise<VisionResult> {
  const candidates = pickCandidates(ctx.nearby)
  if (candidates.length > 0) {
    const { criteria, places } = buildJevOptions(candidates)
    const forJev = await fitForJev(photo).catch(() => photo)
    const answer = await askJev(forJev, ctx.locationLabel, criteria).catch((err: unknown) => {
      console.error("[vision] jev", err instanceof Error ? err.message : err)
      return null
    })
    const picked = answer && readJevChoice(answer, places)
    if (picked) {
      const p = picked.place
      return {
        via: "jev",
        name: p.name,
        description: p.description,
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

  const name = await namePhotoPlace(photo, {
    label: ctx.locationLabel,
    city: ctx.trip?.destination ?? null,
    location: ctx.location,
  })
  return { via: "llm", name, description: null, confidence: null, place: null }
}
