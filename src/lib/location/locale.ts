/**
 * Dónde está el viajero "en palabras": zona horaria (offline, por coordenadas) y
 * ciudad/país (reverse geocoding de Google, cacheado). Todo lo que depende del lugar
 * (horas, búsquedas, la tarjeta de ubicación) sale de acá, nunca de la ciudad del viaje.
 */
import "server-only"

import tzLookup from "@photostructure/tz-lookup"

import type { LatLng } from "@/lib/geo"

import { reverseGeocode } from "./reverse"

export type Locale = { timeZone: string; city: string | null; country: string | null }
export type PlaceName = { city: string | null; country: string | null }

/** Celdas de ~1 km durante un día: moverse dentro de una no repite la consulta. */
const CITY_CACHE = { decimals: 2, ttlMs: 24 * 60 * 60_000 }

export function timeZoneAt(location: LatLng): string {
  try {
    return tzLookup(location.lat, location.lng)
  } catch {
    return "UTC"
  }
}

/** Ciudad y país donde está el viajero. */
export async function placeNameAt(location: LatLng): Promise<PlaceName | null> {
  const parts = await reverseGeocode(location, CITY_CACHE)
  return parts ? { city: parts.city, country: parts.country } : null
}

export async function localeAt(location: LatLng): Promise<Locale> {
  const name = await placeNameAt(location)
  return { timeZone: timeZoneAt(location), city: name?.city ?? null, country: name?.country ?? null }
}
