import "server-only"

import { isSimulated } from "@/lib/time/clock"
import { zonedTimeValue } from "@/lib/time/zoned"

import { hoursOfDay, mondayIndex, openAt } from "./opening"

const DETAILS_URL = "https://places.googleapis.com/v1/places"
/** Los horarios cambian poco: un rato de cache alcanza para no pagar dos veces lo mismo. */
const CACHE_MS = 6 * 60 * 60 * 1000
const TIMEOUT_MS = 5_000

export type OpeningInfo = { openNow: boolean | null; hoursToday: string | null }

type DetailsResponse = { currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] } }

/** Lo que dijo Google; el horario del día y si está abierto se sacan en cada llamada (puede ser hora simulada). */
type Hours = { openNow: boolean | null; weekdays: string[] | undefined }
const cache = new Map<string, { at: number; hours: Hours }>()

function infoAt(hours: Hours, now: Date, timeZone: string): OpeningInfo {
  const hoursToday = hoursOfDay(hours.weekdays, mondayIndex(now, timeZone))
  return {
    openNow: isSimulated(now) ? openAt(hoursToday, zonedTimeValue(now.toISOString(), timeZone)) : hours.openNow,
    hoursToday,
  }
}

/** Si está abierto y el horario de hoy, de Google Place Details. null si no hay key o falla. */
export async function getOpeningInfo(googlePlaceId: string, now: Date, timeZone: string): Promise<OpeningInfo | null> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return null

  const hit = cache.get(googlePlaceId)
  if (hit && Date.now() - hit.at < CACHE_MS) return infoAt(hit.hours, now, timeZone)

  try {
    const res = await fetch(`${DETAILS_URL}/${encodeURIComponent(googlePlaceId)}?languageCode=es`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "currentOpeningHours" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Google Place Details ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const current = ((await res.json()) as DetailsResponse).currentOpeningHours
    const hours = { openNow: current?.openNow ?? null, weekdays: current?.weekdayDescriptions }
    cache.set(googlePlaceId, { at: Date.now(), hours })
    return infoAt(hours, now, timeZone)
  } catch (err) {
    console.error("[places] details", err instanceof Error ? err.message : err)
    return null
  }
}
