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

/** Lugares que van al modelo: los pedidos primero, después los más cercanos, sin repetir. */
export function pickPlaces(nearby: GenUiPlace[], extra: GenUiPlace[], requestedIds: string[], max: number): GenUiPlace[] {
  const byId = new Map([...nearby, ...extra].map((p) => [p.id, p]))
  const requested = requestedIds.map((id) => byId.get(id)).filter((p): p is GenUiPlace => Boolean(p))
  const rest = [...nearby].sort((a, b) => a.walkMinutes - b.walkMinutes)
  const out: GenUiPlace[] = []
  for (const p of [...requested, ...rest]) {
    if (out.length >= max) break
    if (!out.some((o) => o.id === p.id)) out.push(p)
  }
  return out
}

interface UserMessageInput {
  request: string
  places: GenUiPlace[]
  /** Ids que eligió la voz o un tool, en orden: el primero es la recomendación principal. */
  suggestedIds?: string[]
  itinerary: { time: string; title: string; locked: boolean }[]
  weather: string | null
  localTime: string
}

/** Mensaje compacto para el modelo de UI: solo lo necesario para componer la pantalla. */
export function buildGenUiUserMessage({
  request,
  places,
  suggestedIds = [],
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
      ...(suggestedIds.includes(p.id) ? { suggested: suggestedIds.indexOf(p.id) + 1 } : {}),
    })),
    itinerary_today: itinerary,
  }
  return `Armá la pantalla para este pedido. Usá solo ids de "places".\n${JSON.stringify(data)}`
}
