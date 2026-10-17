import "server-only"

import { distanceMeters, walkMinutes, walkRadiusMeters, type LatLng } from "@/lib/geo"
import { createAdminClient } from "@/lib/supabase/admin"

import { GOOGLE_FIELD_MASK, toPlaceRow, type GooglePlace, type PlaceRow } from "./google-types"

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const BIAS_RADIUS_METERS = 3_000
const MAX_RESULTS = 3
/** Google usa la ubicación solo como sesgo: con consultas ambiguas ("la costa") devuelve otros países. */
const MAX_RESULT_DISTANCE_METERS = 30_000
/** Misma búsqueda en la misma zona: no se vuelve a pagar en un rato. */
const CACHE_MS = 60 * 60 * 1000

export type FoundPlace = PlaceRow & { walkMinutes: number; openNow: boolean | null }

const cache = new Map<string, { at: number; places: FoundPlace[] }>()

/**
 * Busca por texto en Google Places (New) cerca de la ubicación ("una crêperie",
 * "el Louvre") y guarda lo encontrado en `places`, para poder sumarlo al plan.
 */
export async function searchPlaces(
  query: string,
  openNow: boolean | null,
  location: LatLng,
  city: string,
  { maxWalkMinutes = null }: { maxWalkMinutes?: number | null } = {}
): Promise<FoundPlace[]> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error("Falta GOOGLE_API_KEY.")

  const key = `${query.toLowerCase().trim()}|${openNow}|${maxWalkMinutes}|${location.lat.toFixed(2)},${location.lng.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.places

  const res = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": `${GOOGLE_FIELD_MASK},places.currentOpeningHours.openNow,places.internationalPhoneNumber`,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "es",
      // Con tope de caminata se piden más: varios de los primeros pueden quedar lejos.
      maxResultCount: maxWalkMinutes === null ? 5 : 10,
      ...(openNow ? { openNow: true } : {}),
      locationBias: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius: maxWalkMinutes === null ? BIAS_RADIUS_METERS : Math.max(300, walkRadiusMeters(maxWalkMinutes)),
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { places?: GooglePlace[] }

  const rows = (body.places ?? [])
    .map((g) => ({ g, row: toPlaceRow(g, city, { keepUnknown: true }) }))
    .filter((r): r is { g: GooglePlace; row: PlaceRow } => r.row !== null)
    .filter(({ row }) => distanceMeters(location, row) <= MAX_RESULT_DISTANCE_METERS)
    .filter(({ row }) => maxWalkMinutes === null || walkMinutes(location, row) <= maxWalkMinutes)
    .slice(0, MAX_RESULTS)

  if (rows.length > 0) {
    const fetchedAt = new Date().toISOString()
    const { error } = await createAdminClient()
      .from("places")
      .upsert(rows.map(({ row }) => ({ ...row, fetched_at: fetchedAt })))
    if (error) console.error("[places] upsert search results failed", error.message)
  }

  const found = rows.map(({ g, row }) => ({
    ...row,
    walkMinutes: walkMinutes(location, row),
    openNow: g.currentOpeningHours?.openNow ?? null,
  }))
  cache.set(key, { at: Date.now(), places: found })
  return found
}
