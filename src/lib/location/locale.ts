/**
 * Dónde está el viajero "en palabras": zona horaria (offline, por coordenadas) y
 * ciudad/país (geocodificación inversa de OpenStreetMap, cacheada). Todo lo que
 * depende del lugar (horas, búsquedas, la tarjeta de ubicación) sale de acá, nunca
 * de la ciudad del viaje.
 */
import tzLookup from "@photostructure/tz-lookup"
import { z } from "zod"

import type { LatLng } from "@/lib/geo"

export type Locale = { timeZone: string; city: string | null; country: string | null }
export type PlaceName = { city: string | null; country: string | null }

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
// Nominatim pide identificarse.
const USER_AGENT = "Rumbo/0.1 (hackathon demo)"
const TIMEOUT_MS = 2_500
const CACHE_MS = 24 * 60 * 60_000
/** Celdas de ~1 km: moverse dentro de una no repite la consulta. */
const CELL_DECIMALS = 2

export function timeZoneAt(location: LatLng): string {
  try {
    return tzLookup(location.lat, location.lng)
  } catch {
    return "UTC"
  }
}

const reverseSchema = z.object({
  address: z.object({
    city: z.string().optional(),
    town: z.string().optional(),
    village: z.string().optional(),
    municipality: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }),
})

/** Ciudad (o pueblo, municipio, provincia) y país de una respuesta de Nominatim. */
export function parseReverseGeocode(raw: unknown): PlaceName | null {
  const parsed = reverseSchema.safeParse(raw)
  if (!parsed.success) return null
  const a = parsed.data.address
  return { city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.state ?? null, country: a.country ?? null }
}

const cache = new Map<string, { at: number; value: Promise<PlaceName | null> }>()

async function fetchPlaceName(location: LatLng): Promise<PlaceName | null> {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lng),
    format: "jsonv2",
    zoom: "10",
    "accept-language": "es",
  })
  try {
    const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Nominatim ${res.status}`)
    return parseReverseGeocode(await res.json())
  } catch (err) {
    console.error("[locale]", err instanceof Error ? err.message : err)
    return null
  }
}

/** Ciudad y país donde está el viajero (cacheado por celda de ~1 km). */
export function placeNameAt(location: LatLng): Promise<PlaceName | null> {
  const key = `${location.lat.toFixed(CELL_DECIMALS)},${location.lng.toFixed(CELL_DECIMALS)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const value = fetchPlaceName(location)
  cache.set(key, { at: Date.now(), value })
  // Si falló, que el próximo pedido lo reintente.
  void value.then((v) => v === null && cache.delete(key))
  return value
}

export async function localeAt(location: LatLng): Promise<Locale> {
  const name = await placeNameAt(location)
  return { timeZone: timeZoneAt(location), city: name?.city ?? null, country: name?.country ?? null }
}
