import "server-only"

import { distanceMeters, walkMinutes, walkRadiusMeters, type LatLng } from "@/lib/geo"
import { timeZoneAt } from "@/lib/location/locale"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSimulated } from "@/lib/time/clock"
import { zonedTimeValue } from "@/lib/time/zoned"

import { GOOGLE_FIELD_MASK, toPlaceRow, type GooglePlace, type PlaceRow } from "./google-types"
import { hoursOfDay, mondayIndex, openAt } from "./opening"
import { pickSearchResults } from "./search-rank"

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const BIAS_RADIUS_METERS = 3_000
/** Un lugar por nombre: el que pidió y un par de alternativas. Un tipo de lugar: una lista corta. */
const MAX_RESULTS_BY_NAME = 3
const MAX_RESULTS_BY_KIND = 5
/** Google ordena por relevancia, no por cercanía: se piden todos y se eligen acá (mismo precio). */
const GOOGLE_MAX_RESULTS = 10
/** Google usa la ubicación solo como sesgo: con consultas ambiguas ("la costa") devuelve otros países. */
const MAX_RESULT_DISTANCE_METERS = 30_000
/** Misma búsqueda en la misma zona: no se vuelve a pagar en un rato. */
const CACHE_MS = 60 * 60 * 1000

export type FoundPlace = PlaceRow & { walkMinutes: number; openNow: boolean | null }

const cache = new Map<string, { at: number; places: FoundPlace[] }>()

/** Buscando un tipo de lugar, con menos que esto a pie se hace una segunda búsqueda. */
const MIN_KIND_RESULTS = 3
const MIN_WALK_RADIUS_METERS = 300
const METERS_PER_DEGREE = 111_320

/** `bias`: Google prefiere lo de ese radio; `restrict`: solo lo de adentro. */
type SearchArea = { bias: number } | { restrict: number }

function locationParam(location: LatLng, area: SearchArea) {
  if ("bias" in area) {
    return { locationBias: { circle: { center: { latitude: location.lat, longitude: location.lng }, radius: area.bias } } }
  }
  // La restricción solo acepta rectángulos.
  const dLat = area.restrict / METERS_PER_DEGREE
  const dLng = area.restrict / (METERS_PER_DEGREE * Math.cos((location.lat * Math.PI) / 180))
  return {
    locationRestriction: {
      rectangle: {
        low: { latitude: location.lat - dLat, longitude: location.lng - dLng },
        high: { latitude: location.lat + dLat, longitude: location.lng + dLng },
      },
    },
  }
}

async function textSearch(apiKey: string, query: string, openNow: boolean | null, location: LatLng, area: SearchArea): Promise<GooglePlace[]> {
  const res = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": `${GOOGLE_FIELD_MASK},places.currentOpeningHours.openNow,places.currentOpeningHours.weekdayDescriptions,places.internationalPhoneNumber,places.businessStatus`,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "es",
      maxResultCount: GOOGLE_MAX_RESULTS,
      ...(openNow ? { openNow: true } : {}),
      ...locationParam(location, area),
    }),
  })
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return ((await res.json()) as { places?: GooglePlace[] }).places ?? []
}

/**
 * Busca por texto en Google Places (New) cerca de la ubicación ("una crêperie",
 * "el Louvre") y guarda lo encontrado en `places`, para poder sumarlo al plan.
 */
export async function searchPlaces(
  query: string,
  openNow: boolean | null,
  location: LatLng,
  city: string,
  { maxWalkMinutes = null, now = new Date() }: { maxWalkMinutes?: number | null; now?: Date } = {}
): Promise<FoundPlace[]> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error("Falta GOOGLE_API_KEY.")

  // Con hora simulada, el "abierto ahora" de Google (que mira la hora real) no sirve: se calcula
  // con el horario de la semana a esa hora.
  const simulated = isSimulated(now)
  const askOpenNow = openNow && !simulated
  const timeZone = timeZoneAt(location)
  const key = `${query.toLowerCase().trim()}|${openNow}|${maxWalkMinutes}|${location.lat.toFixed(2)},${location.lng.toFixed(2)}|${simulated ? now.toISOString().slice(0, 15) : ""}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.places

  // Sin tope de caminata busca un lugar por su nombre ("el Louvre"); con tope, un tipo ("una farmacia").
  const byName = maxWalkMinutes === null
  const max = byName ? MAX_RESULTS_BY_NAME : MAX_RESULTS_BY_KIND
  const area: SearchArea = byName
    ? { bias: BIAS_RADIUS_METERS }
    : { bias: Math.max(MIN_WALK_RADIUS_METERS, walkRadiusMeters(maxWalkMinutes)) }

  const toCandidates = (places: GooglePlace[]) =>
    places
      .map((g) => ({ g, row: toPlaceRow(g, city, { keepUnknown: true }) }))
      .filter((r): r is { g: GooglePlace; row: PlaceRow } => r.row !== null)
      .filter(({ row }) => distanceMeters(location, row) <= MAX_RESULT_DISTANCE_METERS)
      .filter(({ row }) => maxWalkMinutes === null || walkMinutes(location, row) <= maxWalkMinutes)
      .map(({ g, row }) => ({
        g,
        row,
        id: row.id,
        name: row.name,
        walkMinutes: walkMinutes(location, row),
        rating: row.rating,
        ratingCount: row.rating_count,
        status: g.businessStatus ?? null,
      }))

  let candidates = toCandidates(await textSearch(apiKey, query, askOpenNow, location, area))
  let rows = pickSearchResults(candidates, { byName, max })
  // Google ordena por relevancia en toda la zona: si quedaron pocos a pie, se completa
  // buscando solo dentro del radio caminable (como "cerca" en Google Maps).
  if (!byName && rows.length < MIN_KIND_RESULTS) {
    const nearby = toCandidates(await textSearch(apiKey, query, askOpenNow, location, { restrict: area.bias }))
    const seen = new Set(candidates.map((c) => c.id))
    candidates = [...candidates, ...nearby.filter((c) => !seen.has(c.id))]
    rows = pickSearchResults(candidates, { byName, max })
  }

  if (rows.length > 0) {
    const fetchedAt = new Date().toISOString()
    const { error } = await createAdminClient()
      .from("places")
      .upsert(rows.map(({ row }) => ({ ...row, fetched_at: fetchedAt })))
    if (error) console.error("[places] upsert search results failed", error.message)
  }

  const day = mondayIndex(now, timeZone)
  const localTime = zonedTimeValue(now.toISOString(), timeZone)
  const found = rows
    .map(({ g, row }) => ({
      ...row,
      walkMinutes: walkMinutes(location, row),
      openNow: simulated
        ? openAt(hoursOfDay(g.currentOpeningHours?.weekdayDescriptions, day), localTime)
        : (g.currentOpeningHours?.openNow ?? null),
    }))
    .filter((p) => !(openNow && simulated && p.openNow === false))
  cache.set(key, { at: Date.now(), places: found })
  return found
}
