import "server-only"

import type { LatLng } from "@/lib/geo"

import { parseGoogleReverse, streetLine, type AddressParts } from "./geocode"

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
const TIMEOUT_MS = 2_500
const MAX_CACHE = 1_000

type CacheEntry = { at: number; value: Promise<AddressParts | null> }
const cache = new Map<string, CacheEntry>()

async function fetchReverse(location: LatLng): Promise<AddressParts | null> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return null
  const url = new URL(GEOCODE_URL)
  url.search = new URLSearchParams({ latlng: `${location.lat},${location.lng}`, language: "es", key: apiKey }).toString()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Google Geocoding ${res.status}`)
    const parts = parseGoogleReverse(await res.json())
    if (!parts) throw new Error("Google Geocoding sin resultados")
    return parts
  } catch (err) {
    console.error("[geocode]", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Reverse geocoding de Google, cacheado por celda (`decimals` de grilla) durante `ttlMs`.
 * Si falla, el próximo pedido lo reintenta. Null si no se pudo: es contexto, todo sigue sin él.
 */
export function reverseGeocode(location: LatLng, { decimals, ttlMs }: { decimals: number; ttlMs: number }): Promise<AddressParts | null> {
  const key = `${decimals}|${location.lat.toFixed(decimals)},${location.lng.toFixed(decimals)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value
  const value = fetchReverse(location)
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), value })
  void value.then((v) => v === null && cache.delete(key))
  return value
}

/** ~11 m de grilla: caminar unos pasos no dispara otra consulta. */
const STREET_CACHE = { decimals: 4, ttlMs: 60 * 60_000 }

/** Calle y barrio donde está el viajero ("Av. Ramón Anador, La Blanqueada, Montevideo"). */
export async function getStreetAddress(location: LatLng): Promise<string | null> {
  return streetLine(await reverseGeocode(location, STREET_CACHE))
}
