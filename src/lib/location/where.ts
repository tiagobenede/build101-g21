import "server-only"

import type { LatLng } from "@/lib/geo"

import { cornerPairs, parseIntersection, pickCorner, routesFromReverse, type Where } from "./corner"
import { parseGoogleReverse } from "./geocode"

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
const TIMEOUT_MS = 2_500
/** ~11 m de grilla, una hora: caminar unos pasos no dispara otra ronda de pedidos. */
const CACHE_DECIMALS = 4
const CACHE_TTL_MS = 60 * 60_000
const MAX_CACHE = 500
/** Si el reverse trae una sola calle, se mira alrededor a esta distancia para encontrar las que la cruzan. */
const PROBE_METERS = 60
const METERS_PER_DEGREE_LAT = 111_320

async function geocode(params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return null
  const url = new URL(GEOCODE_URL)
  url.search = new URLSearchParams({ ...params, language: "es", key: apiKey }).toString()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Google Geocoding ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error("[where]", err instanceof Error ? err.message : err)
    return null
  }
}

const latlng = ({ lat, lng }: LatLng) => `${lat},${lng}`

/** Puntos a `PROBE_METERS` al norte, este, sur y oeste. */
function probes({ lat, lng }: LatLng): LatLng[] {
  const dLat = PROBE_METERS / METERS_PER_DEGREE_LAT
  const dLng = PROBE_METERS / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180))
  return [
    { lat: lat + dLat, lng },
    { lat, lng: lng + dLng },
    { lat: lat - dLat, lng },
    { lat, lng: lng - dLng },
  ]
}

async function findWhere(location: LatLng): Promise<Where> {
  const raw = await geocode({ latlng: latlng(location) })
  const parts = parseGoogleReverse(raw)
  let streets = routesFromReverse(raw)
  if (streets.length === 1) {
    const around = await Promise.all(probes(location).map((p) => geocode({ latlng: latlng(p), result_type: "route" })))
    streets = [...new Set([...streets, ...around.flatMap(routesFromReverse)])]
  }
  const where = { location, street: streets[0] ?? parts?.street ?? null, barrio: parts?.barrio ?? null, city: parts?.city ?? null }

  const area = [parts?.city, parts?.country].filter(Boolean).join(", ")
  const corners = await Promise.all(
    cornerPairs(streets).map(async (pair) => {
      const at = parseIntersection(await geocode({ address: `${pair[0]} & ${pair[1]}${area ? `, ${area}` : ""}` }))
      return at ? [{ streets: pair, at }] : []
    })
  )
  return { ...where, corner: pickCorner(location, corners.flat()) }
}

type CacheEntry = { at: number; value: Promise<Where> }
const cache = new Map<string, CacheEntry>()

/**
 * Calle, esquina más cercana y coordenadas del viajero (Google Geocoding). Cacheado por
 * celda; las coordenadas siempre son las del pedido. Si Google falla, quedan solo ellas.
 */
export async function getWhere(location: LatLng): Promise<Where> {
  const key = `${location.lat.toFixed(CACHE_DECIMALS)},${location.lng.toFixed(CACHE_DECIMALS)}`
  const hit = cache.get(key)
  const fresh = hit && Date.now() - hit.at < CACHE_TTL_MS
  const value = fresh ? hit.value : findWhere(location)
  if (!fresh) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
    cache.set(key, { at: Date.now(), value })
    // Sin calle (Google falló): que el próximo pedido reintente.
    void value.then((w) => w.street === null && cache.delete(key))
  }
  return { ...(await value), location }
}
