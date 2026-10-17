import "server-only"

import type { LatLng } from "@/lib/geo"

import { parseReverseGeocode } from "./geocode"

const REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
// Nominatim pide identificarse y no más de 1 pedido por segundo.
const USER_AGENT = "Rumbo/0.1 (hackathon demo)"
const MIN_INTERVAL_MS = 1_000
const TIMEOUT_MS = 2_000
const CACHE_MS = 60 * 60 * 1000
const MAX_CACHE = 500

const cache = new Map<string, { at: number; address: string | null }>()
let lastRequestAt = 0

/** ~11 m de grilla: caminar unos pasos no dispara otra consulta. */
const cacheKey = ({ lat, lng }: LatLng) => `${lat.toFixed(4)},${lng.toFixed(4)}`

/**
 * Calle y barrio donde está el viajero (Nominatim, gratis). Null si falla: es
 * contexto, la llamada sigue sin él.
 */
export async function getStreetAddress(location: LatLng): Promise<string | null> {
  const key = cacheKey(location)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.address

  // Turnos de a uno por segundo: si abre la llamada y enseguida se refresca, espera.
  const now = Date.now()
  const slot = Math.max(now, lastRequestAt + MIN_INTERVAL_MS)
  lastRequestAt = slot
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now))

  const url = new URL(REVERSE_URL)
  url.search = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lng),
    format: "jsonv2",
    zoom: "18",
    addressdetails: "1",
    "accept-language": "es",
  }).toString()

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) {
      console.error("[location] reverse Nominatim respondió", res.status)
      return null
    }
    const address = parseReverseGeocode(await res.json())
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
    cache.set(key, { at: Date.now(), address })
    return address
  } catch (err) {
    console.error("[location] reverse Nominatim falló", err instanceof Error ? err.message : err)
    return null
  }
}
