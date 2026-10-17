import "server-only"

import type { LatLng } from "@/lib/geo"
import { createAdminClient } from "@/lib/supabase/admin"

import { GOOGLE_FIELD_MASK, toPlaceRow, type GooglePlace } from "./google-types"
import { nearbyQueries, type NearbyQuery } from "./nearby-plan"

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
/** Una zona pedida hace menos de esto no se vuelve a pedir (los lugares no cambian tan seguido). */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RESULTS = 20

/** Zonas ya pedidas en este proceso (evita ir a la base en cada pedido). */
const freshCells = new Map<string, number>()
const inFlight = new Map<string, Promise<void>>()

type SearchOptions = Pick<NearbyQuery, "includedTypes" | "radius" | "rankPreference">

/** Nearby Search de Google alrededor de `location` (exportada para las pruebas de relevancia). */
export async function searchNearby(apiKey: string, location: LatLng, options: SearchOptions): Promise<GooglePlace[]> {
  const res = await fetch(NEARBY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": GOOGLE_FIELD_MASK },
    body: JSON.stringify({
      includedTypes: options.includedTypes,
      maxResultCount: MAX_RESULTS,
      rankPreference: options.rankPreference,
      languageCode: "es",
      locationRestriction: {
        circle: { center: { latitude: location.lat, longitude: location.lng }, radius: options.radius },
      },
    }),
  })
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { places?: GooglePlace[] }
  return body.places ?? []
}

const isFresh = (cell: string) => Date.now() - (freshCells.get(cell) ?? 0) < REFRESH_MS

async function refresh(location: LatLng, city: string, queries: NearbyQuery[]): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return

  const admin = createAdminClient()
  const cells = [...new Set(queries.map((q) => q.cell))]
  const since = new Date(Date.now() - REFRESH_MS).toISOString()
  const { data: known, error: cellsError } = await admin.from("place_cells").select("cell, fetched_at").in("cell", cells).gte("fetched_at", since)
  if (cellsError) throw new Error(`No se pudieron leer las zonas: ${cellsError.message}`)
  for (const k of known ?? []) freshCells.set(k.cell as string, new Date(k.fetched_at as string).getTime())

  const pending = queries.filter((q) => !isFresh(q.cell))
  if (pending.length === 0) return

  const results = await Promise.allSettled(pending.map((q) => searchNearby(apiKey, location, q)))
  const fetchedAt = new Date().toISOString()
  const rows = new Map(
    results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .map((g) => toPlaceRow(g, city))
      .filter((r) => r !== null)
      .map((r) => [r.id, { ...r, fetched_at: fetchedAt }])
  )
  if (rows.size > 0) {
    const { error } = await admin.from("places").upsert([...rows.values()])
    if (error) throw new Error(`No se pudieron guardar los lugares: ${error.message}`)
  }

  // Una zona queda pedida solo si todas sus búsquedas salieron bien; si no, se reintenta.
  const failed = new Set(pending.filter((_, i) => results[i].status === "rejected").map((q) => q.cell))
  for (const r of results) if (r.status === "rejected") console.error("[places]", r.reason instanceof Error ? r.reason.message : r.reason)
  const done = [...new Set(pending.map((q) => q.cell))].filter((c) => !failed.has(c))
  if (done.length === 0) return
  const { error } = await admin.from("place_cells").upsert(done.map((cell) => ({ cell, fetched_at: fetchedAt })))
  if (error) console.error("[places] no se pudieron marcar las zonas", error.message)
  const now = Date.now()
  for (const c of done) freshCells.set(c, now)
}

/**
 * Se asegura de que `places` tenga los lugares de Google alrededor de la ubicación:
 * lo popular de la zona (~1 km) y lo más cercano de la cuadra (~400 m). Cada zona se pide
 * una vez por semana; si Google falla, se sigue con lo que ya haya guardado.
 */
export async function ensureNearbyPlaces(location: LatLng, city: string): Promise<void> {
  const queries = nearbyQueries(location)
  if (queries.every((q) => isFresh(q.cell))) return

  const key = [...new Set(queries.map((q) => q.cell))].join("|")
  let pending = inFlight.get(key)
  if (!pending) {
    pending = refresh(location, city, queries)
      .catch((err: unknown) => console.error("[places]", err instanceof Error ? err.message : err))
      .finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
  }
  await pending
}
