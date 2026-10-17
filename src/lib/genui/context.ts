import type { GenUiPlace } from "./types"

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

/** Palabras de nombres de lugares que no identifican a ninguno. */
const GENERIC_WORDS = new Set([
  "museo", "musee", "museum", "place", "plaza", "cafe", "jardin", "jardins", "parque", "parc", "iglesia", "eglise",
  "mercado", "marche", "restaurante", "restaurant", "libreria", "galerie", "galeria", "catedral", "paris", "nacional",
])
const MIN_WORD_LENGTH = 5

/** Ids de lugares que el pedido nombra ("llevame al Picasso" → Museo Picasso). */
export function namedPlaceIds(request: string, places: { id: string; name: string }[]): string[] {
  const words = new Set(normalize(request).split(/[^a-z0-9]+/).filter((w) => w.length >= MIN_WORD_LENGTH && !GENERIC_WORDS.has(w)))
  return places
    .filter((p) => normalize(p.name).split(/[^a-z0-9]+/).some((w) => words.has(w)))
    .map((p) => p.id)
}

/**
 * Lugares de la pantalla: exactamente los que eligió el agente (los de su último tool),
 * en su orden. Nunca se completa con otros: la pantalla muestra lo mismo que dice la voz.
 */
export function screenPlaces(all: GenUiPlace[], placeIds: string[], max: number): GenUiPlace[] {
  const byId = new Map(all.map((p) => [p.id, p]))
  const ids = [...new Set(placeIds)].filter((id) => byId.has(id)).slice(0, max)
  return ids.map((id) => byId.get(id)!)
}

interface UserMessageInput {
  request: string
  /** Los lugares de la pantalla, en el orden del agente: el primero es el principal. */
  places: GenUiPlace[]
  itinerary: { time: string; title: string; locked: boolean }[]
  weather: string | null
  localTime: string
}

/** Mensaje compacto para el modelo de UI: solo lo necesario para componer la pantalla. */
export function buildGenUiUserMessage({
  request,
  places,
  itinerary,
  weather,
  localTime,
}: UserMessageInput): string {
  const data = {
    request,
    local_time: localTime,
    weather,
    places: places.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      tags: p.tags,
      walk_min: p.walkMinutes,
      visit_min: p.visitMinutes,
      rating: p.rating,
    })),
    itinerary_today: itinerary,
  }
  return `Armá la pantalla para este pedido. Usá solo ids de "places".\n${JSON.stringify(data)}`
}
