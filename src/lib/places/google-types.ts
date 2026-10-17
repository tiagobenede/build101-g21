/**
 * Traduce los tipos de Google Places (New) a lo que usa Rumbo: categoría (la de
 * los íconos), tags de gustos y minutos típicos de visita. Puro, para testearlo solo.
 */
import type { Place } from "@/lib/agent/types"

type Kind = { category: string; tags: string[]; minutes: number }

/** En orden de prioridad: el primer tipo del lugar que aparezca acá define la categoría. */
const KINDS: [type: string, kind: Kind][] = [
  ["art_museum", { category: "Museo", tags: ["arte", "diseño"], minutes: 60 }],
  ["history_museum", { category: "Museo", tags: ["historia"], minutes: 60 }],
  ["science_museum", { category: "Museo", tags: ["ciencia", "historia"], minutes: 60 }],
  ["museum", { category: "Museo", tags: ["arte", "historia"], minutes: 60 }],
  ["art_gallery", { category: "Museo", tags: ["arte", "diseño"], minutes: 40 }],
  ["market", { category: "Mercado", tags: ["mercados", "comida"], minutes: 30 }],
  ["bakery", { category: "Panadería", tags: ["comida", "café"], minutes: 15 }],
  ["cafe", { category: "Café", tags: ["café"], minutes: 25 }],
  ["coffee_shop", { category: "Café", tags: ["café"], minutes: 20 }],
  ["ice_cream_shop", { category: "Heladería", tags: ["comida"], minutes: 15 }],
  ["bar", { category: "Bar", tags: ["comida"], minutes: 45 }],
  ["restaurant", { category: "Restaurante", tags: ["comida"], minutes: 45 }],
  ["book_store", { category: "Librería", tags: ["libros"], minutes: 20 }],
  ["park", { category: "Parque", tags: ["parques"], minutes: 30 }],
  ["garden", { category: "Parque", tags: ["parques"], minutes: 30 }],
  ["plaza", { category: "Plaza", tags: ["parques", "arquitectura"], minutes: 15 }],
  ["church", { category: "Monumento", tags: ["arquitectura", "historia"], minutes: 20 }],
  ["historical_landmark", { category: "Monumento", tags: ["historia", "arquitectura"], minutes: 20 }],
  ["tourist_attraction", { category: "Monumento", tags: ["historia", "arquitectura"], minutes: 30 }],
  ["shopping_mall", { category: "Pasaje", tags: ["compras"], minutes: 30 }],
  ["clothing_store", { category: "Pasaje", tags: ["compras", "diseño"], minutes: 20 }],
  ["department_store", { category: "Pasaje", tags: ["compras"], minutes: 30 }],
]

const KIND_BY_TYPE = new Map(KINDS)
/** Para lo que se busca por nombre (Text Search): se guarda aunque no sea de un tipo que usamos. */
const OTHER: Kind = { category: "Lugar", tags: [], minutes: 30 }
const MAX_TAGGED_TYPES = 3

/** Tipos que se piden a Nearby Search, en búsquedas separadas para que no gane siempre la comida. */
export const FOOD_TYPES = ["restaurant", "cafe", "coffee_shop", "bakery", "market", "bar", "ice_cream_shop"]
export const SHOP_TYPES = ["shopping_mall", "department_store", "clothing_store"]
export const SIGHT_TYPES = ["museum", "art_gallery", "park", "tourist_attraction", "historical_landmark", "book_store", "church"]

/** Lo que pedimos con el field mask (lo mínimo: el precio de Google depende de los campos). */
export type GooglePlace = {
  id: string
  displayName?: { text?: string }
  primaryType?: string
  types?: string[]
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  editorialSummary?: { text?: string }
  currentOpeningHours?: { openNow?: boolean }
  websiteUri?: string
}

export const GOOGLE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.types",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.editorialSummary",
  "places.websiteUri",
].join(",")

export type PlaceRow = Place & { city: string; rating_count: number | null; data: Record<string, unknown> }

/**
 * Fila de `places` para un lugar de Google, o null si no tiene datos o no es de un
 * tipo que usamos (salvo `keepUnknown`, para lo que el viajero buscó por nombre).
 */
export function toPlaceRow(g: GooglePlace, city: string, { keepUnknown = false } = {}): PlaceRow | null {
  const name = g.displayName?.text
  const lat = g.location?.latitude
  const lng = g.location?.longitude
  if (!name || lat === undefined || lng === undefined) return null

  const types = [g.primaryType, ...(g.types ?? [])].filter((t): t is string => Boolean(t))
  // Cualquier "*_restaurant" (french_restaurant, ...) cuenta como restaurante.
  const normalized = [...new Set(types.map((t) => (t.endsWith("_restaurant") ? "restaurant" : t)))]
  const known = normalized.flatMap((t) => KIND_BY_TYPE.get(t) ?? [])
  const main = known[0] ?? (keepUnknown ? OTHER : null)
  if (!main) return null

  // Solo los primeros tipos: Google suma muchos secundarios (un pasaje "es" restaurante y librería).
  const tags = [...new Set(known.slice(0, MAX_TAGGED_TYPES).flatMap((k) => k.tags))]
  return {
    id: `g:${g.id}`,
    name,
    category: main.category,
    tags,
    description: g.editorialSummary?.text ?? null,
    lat,
    lng,
    rating: g.rating !== undefined ? Math.round(g.rating * 10) / 10 : null,
    typical_visit_minutes: main.minutes,
    rating_count: g.userRatingCount ?? null,
    city,
    data: { google_place_id: g.id, types, ...(g.websiteUri ? { website: g.websiteUri } : {}) },
  }
}
