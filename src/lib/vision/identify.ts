import "server-only"

import type { PlaceCard } from "@/hooks/voice-session-types"
import type { NearbyPlace, TravelerContext } from "@/lib/data/session"

import { buildJevOptions, pickCandidates, readJevChoice } from "./choose"
import { describePhoto, type PhotoSubject, type SeenKind } from "./describe"
import { fitForJev } from "./fit"
import { askJev, type Photo } from "./jev"

/**
 * "¿Qué estoy viendo?" (C-3). Dice qué es; explicarlo o sumarlo al plan lo hace el agente.
 * Corren a la vez:
 * - Jev elige entre los lugares a menos de 250 m o "ninguno" (sirve para tener el lugar de
 *   `places`, con su tarjeta y "Al plan").
 * - Un LLM con visión dice qué es sin opciones: un lugar, una obra (la Gioconda adentro
 *   del Louvre) u otra cosa. Si es una obra, gana el LLM aunque Jev haya elegido el museo.
 */

export type VisionResult = {
  /** Qué camino respondió: sirve para el panel de demo y para ajustar el umbral. */
  via: "jev" | "llm"
  /** Qué es; null si no se pudo identificar. */
  name: string | null
  /** lugar, obra u otro (null si no se identificó). */
  kind: SeenKind | null
  /** Para una obra u otra cosa: dónde está (el museo). */
  where: string | null
  /** Descripción de Google (Jev) o la línea del LLM (autor, año). */
  description: string | null
  /** Confianza de Jev; null cuando respondió el LLM. */
  confidence: number | null
  /** Lugar de `places` (para "Agregar al plan") cuando respondió Jev; null con el LLM. */
  place: PlaceCard | null
}

type JevPick = { place: NearbyPlace; confidence: number }

const NOTHING: VisionResult = { via: "llm", name: null, kind: null, where: null, description: null, confidence: null, place: null }

/** Junta las dos respuestas. Exportada para los tests. */
export function combineVision(picked: JevPick | null, seen: PhotoSubject | null): VisionResult {
  // Una obra o una cosa: la cuenta el LLM; el lugar de Jev (el museo) queda como "dónde".
  if (seen && seen.kind !== "lugar") {
    return {
      via: "llm",
      name: seen.name,
      kind: seen.kind,
      where: seen.where ?? picked?.place.name ?? null,
      description: seen.about,
      confidence: null,
      place: null,
    }
  }
  if (picked) {
    const p = picked.place
    return {
      via: "jev",
      name: p.name,
      kind: "lugar",
      where: null,
      description: p.description ?? seen?.about ?? null,
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
  if (seen) return { ...NOTHING, name: seen.name, kind: "lugar", description: seen.about }
  return NOTHING
}

async function pickWithJev(photo: Photo, ctx: TravelerContext): Promise<JevPick | null> {
  const candidates = pickCandidates(ctx.nearby)
  if (candidates.length === 0) return null
  const { criteria, places } = buildJevOptions(candidates)
  const forJev = await fitForJev(photo).catch(() => photo)
  const answer = await askJev(forJev, ctx.locationLabel, criteria).catch((err: unknown) => {
    console.error("[vision] jev", err instanceof Error ? err.message : err)
    return null
  })
  return answer ? readJevChoice(answer, places) : null
}

export async function identifyPhoto(photo: Photo, ctx: TravelerContext): Promise<VisionResult> {
  const [picked, seen] = await Promise.all([
    pickWithJev(photo, ctx),
    describePhoto(photo, { label: ctx.locationLabel, city: ctx.trip?.destination ?? null, location: ctx.location }).catch((err: unknown) => {
      console.error("[vision] llm", err instanceof Error ? err.message : err)
      return null
    }),
  ])
  return combineVision(picked, seen)
}
