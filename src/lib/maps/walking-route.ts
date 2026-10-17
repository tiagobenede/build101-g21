import "server-only"

import type { LatLng } from "@/lib/geo"

import { decodePolyline } from "./polyline"

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
const TIMEOUT_MS = 3_000
const MAX_CACHE = 500
/** ~10 m: el tool del agente y el mapa de la pantalla piden la misma ruta y comparten el resultado. */
const CACHE_DECIMALS = 4
const CACHE_TTL_MS = 10 * 60_000

export type WalkingRoute = { path: LatLng[]; meters: number; minutes: number }

type CacheEntry = { at: number; value: Promise<WalkingRoute | null> }
const cache = new Map<string, CacheEntry>()

async function fetchRoute(from: LatLng, to: LatLng): Promise<WalkingRoute | null> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return null
  const waypoint = ({ lat, lng }: LatLng) => ({ location: { latLng: { latitude: lat, longitude: lng } } })
  try {
    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({ origin: waypoint(from), destination: waypoint(to), travelMode: "WALK", languageCode: "es" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Google Routes ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as {
      routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[]
    }
    const route = body.routes?.[0]
    const encoded = route?.polyline?.encodedPolyline
    if (!route || !encoded) throw new Error("Google Routes sin ruta")
    const seconds = Number.parseInt(route.duration ?? "0", 10)
    return { path: decodePolyline(encoded), meters: route.distanceMeters ?? 0, minutes: Math.max(1, Math.round(seconds / 60)) }
  } catch (err) {
    console.error("[routes]", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Ruta a pie por calles (Google Routes API), cacheada unos minutos. Null si no se pudo:
 * el mapa vuelve a la línea recta y los minutos a la estimación.
 */
export function walkingRoute(from: LatLng, to: LatLng): Promise<WalkingRoute | null> {
  const cell = (p: LatLng) => `${p.lat.toFixed(CACHE_DECIMALS)},${p.lng.toFixed(CACHE_DECIMALS)}`
  const key = `${cell(from)}|${cell(to)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = fetchRoute(from, to)
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), value })
  // Si falló, que el próximo pedido lo reintente.
  void value.then((route) => {
    if (!route && cache.get(key)?.value === value) cache.delete(key)
  })
  return value
}
