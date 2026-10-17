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
 *   Si es un lugar que no es el que eligió Jev, también gana el LLM: Jev solo puede elegir
 *   entre los cercanos (parado en el Champ de Mars, la Torre Eiffel queda a más de 250 m
 *   y Jev elegía el parque).
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
export function combineVision(picked: JevPick | null, seen: PhotoSubject | null, candidates: readonly NearbyPlace[] = []): VisionResult {
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
  // Jev solo elige entre los cercanos: si el LLM nombró otro lugar, se busca ese entre los
  // cercanos y, si no está, lo dice el LLM (la pantalla lo busca en el mapa por nombre).
  const agreed = picked && (!seen || sameThing(seen, picked.place.name)) ? picked : null
  const p = agreed?.place ?? (seen ? candidates.find((c) => sameThing(seen, c.name)) : undefined)
  if (p) {
    return {
      via: agreed ? "jev" : "llm",
      name: p.name,
      kind: "lugar",
      where: null,
      description: p.description ?? seen?.about ?? null,
      confidence: agreed?.confidence ?? null,
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

/** Palabras que no alcanzan para decir que dos nombres son el mismo lugar. */
const GENERIC_WORDS = new Set(
  "museo musee museum plaza place parque parc jardin iglesia eglise catedral cathedrale torre tour calle rue puente pont palacio palais".split(" ")
)

const words = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w))

/** Si el nombre de un lugar de Google es lo que dijo el LLM ("Musée du Louvre" ≈ "Museo del Louvre"). */
export function sameThing(seen: Pick<PhotoSubject, "name" | "mapName">, placeName: string): boolean {
  const theirs = new Set(words(placeName))
  return [seen.name, seen.mapName].some((n) => n !== null && words(n).some((w) => theirs.has(w)))
}

async function pickWithJev(photo: Photo, ctx: TravelerContext, candidates: NearbyPlace[]): Promise<JevPick | null> {
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
  const candidates = pickCandidates(ctx.nearby)
  const [picked, seen] = await Promise.all([
    pickWithJev(photo, ctx, candidates),
    describePhoto(photo, { label: ctx.locationLabel, city: ctx.trip?.destination ?? null, location: ctx.location }).catch((err: unknown) => {
      console.error("[vision] llm", err instanceof Error ? err.message : err)
      return null
    }),
  ])
  return combineVision(picked, seen, candidates)
}
