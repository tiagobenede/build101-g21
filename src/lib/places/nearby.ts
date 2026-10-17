import "server-only"

import type { LatLng } from "@/lib/geo"
import { createAdminClient } from "@/lib/supabase/admin"

import { FOOD_TYPES, GOOGLE_FIELD_MASK, SHOP_TYPES, SIGHT_TYPES, toPlaceRow, type GooglePlace } from "./google-types"

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
const SEARCH_RADIUS_METERS = 1_500
/** Un lugar traído hace menos de esto no se vuelve a pedir. */
const REFRESH_MS = 24 * 60 * 60 * 1000
/** Con esta cantidad de lugares frescos cerca no hace falta llamar a Google. */
const ENOUGH_CACHED = 15
/** Celda de ~1 km: moverse dentro de la misma celda no dispara otra búsqueda. */
const cellOf = ({ lat, lng }: LatLng) => `${lat.toFixed(2)},${lng.toFixed(2)}`

const freshCells = new Map<string, number>()
const inFlight = new Map<string, Promise<void>>()

/** Nearby Search de Google con esos tipos (exportada para las pruebas de relevancia). */
export async function searchNearby(apiKey: string, location: LatLng, includedTypes: string[]): Promise<GooglePlace[]> {
  const res = await fetch(NEARBY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": GOOGLE_FIELD_MASK },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      languageCode: "es",
      locationRestriction: {
        circle: { center: { latitude: location.lat, longitude: location.lng }, radius: SEARCH_RADIUS_METERS },
      },
    }),
  })
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { places?: GooglePlace[] }
  return body.places ?? []
}

async function refresh(location: LatLng, city: string): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return

  const admin = createAdminClient()
  const since = new Date(Date.now() - REFRESH_MS).toISOString()
  // ~1,5 km alrededor: si ya hay suficientes lugares frescos (de otra request o de antes de reiniciar), listo.
  const { count } = await admin
    .from("places")
    .select("id", { count: "exact", head: true })
    .gte("fetched_at", since)
    .gte("lat", location.lat - 0.0135)
    .lte("lat", location.lat + 0.0135)
    .gte("lng", location.lng - 0.02)
    .lte("lng", location.lng + 0.02)
  if ((count ?? 0) >= ENOUGH_CACHED) return

  const results = await Promise.all([FOOD_TYPES, SIGHT_TYPES, SHOP_TYPES].map((types) => searchNearby(apiKey, location, types)))
  const rows = new Map(
    results
      .flat()
      .map((g) => toPlaceRow(g, city))
      .filter((r) => r !== null)
      .map((r) => [r.id, { ...r, fetched_at: new Date().toISOString() }])
  )
  if (rows.size === 0) return

  const { error } = await admin.from("places").upsert([...rows.values()])
  if (error) throw new Error(`No se pudieron guardar los lugares: ${error.message}`)
}

/**
 * Se asegura de que `places` tenga los lugares de Google alrededor de la ubicación.
 * Como mucho tres llamadas a Google por celda de ~1 km cada 24 h; si Google falla,
 * se sigue con lo que ya haya guardado.
 */
export async function ensureNearbyPlaces(location: LatLng, city: string): Promise<void> {
  const cell = cellOf(location)
  if (Date.now() - (freshCells.get(cell) ?? 0) < REFRESH_MS) return

  let pending = inFlight.get(cell)
  if (!pending) {
    pending = refresh(location, city)
      .then(() => {
        freshCells.set(cell, Date.now())
      })
      .catch((err: unknown) => console.error("[places]", err instanceof Error ? err.message : err))
      .finally(() => inFlight.delete(cell))
    inFlight.set(cell, pending)
  }
  await pending
}
