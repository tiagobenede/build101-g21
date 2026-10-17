import "server-only"

const DETAILS_URL = "https://places.googleapis.com/v1/places"
/** Los horarios cambian poco: un rato de cache alcanza para no pagar dos veces lo mismo. */
const CACHE_MS = 6 * 60 * 60 * 1000
const TIMEOUT_MS = 5_000

export type OpeningInfo = { openNow: boolean | null; hoursToday: string | null }

type DetailsResponse = { currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] } }

const cache = new Map<string, { at: number; info: OpeningInfo }>()

/** Día de la semana en la zona del viaje, con lunes = 0 (el orden de `weekdayDescriptions`). */
function mondayIndex(now: Date, timeZone: string): number {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now)
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day)
}

/** Si está abierto y el horario de hoy, de Google Place Details. null si no hay key o falla. */
export async function getOpeningInfo(googlePlaceId: string, now: Date, timeZone: string): Promise<OpeningInfo | null> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return null

  const hit = cache.get(googlePlaceId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.info

  try {
    const res = await fetch(`${DETAILS_URL}/${encodeURIComponent(googlePlaceId)}?languageCode=es`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "currentOpeningHours" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Google Place Details ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const hours = ((await res.json()) as DetailsResponse).currentOpeningHours
    const today = hours?.weekdayDescriptions?.[mondayIndex(now, timeZone)] ?? null
    // "lunes: 10:00–18:00" → "10:00–18:00"
    const info = { openNow: hours?.openNow ?? null, hoursToday: today ? today.replace(/^[^:]+:\s*/, "") : null }
    cache.set(googlePlaceId, { at: Date.now(), info })
    return info
  } catch (err) {
    console.error("[places] details", err instanceof Error ? err.message : err)
    return null
  }
}
