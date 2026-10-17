/**
 * Clima con Open-Meteo (gratis, sin key). Va a las instrucciones como una línea:
 * es un dato chico que cambia lento, no hace falta un tool.
 */
import type { LatLng } from "@/lib/geo"

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
const CACHE_MS = 30 * 60 * 1000
const TIMEOUT_MS = 2_000
const FORECAST_HOURS = 6
/** Desde esta probabilidad avisamos que puede llover. */
const RAIN_PROBABILITY = 50

type Forecast = {
  current?: { temperature_2m?: number; weather_code?: number }
  hourly?: { time?: string[]; precipitation_probability?: number[] }
}

/** Códigos WMO agrupados en lo que le importa a alguien que camina. */
function describeCode(code: number): string {
  if (code === 0) return "despejado"
  if (code <= 2) return "algo nublado"
  if (code === 3) return "nublado"
  if (code <= 48) return "con niebla"
  if (code <= 67 || (code >= 80 && code <= 82)) return "lloviendo"
  if (code <= 77 || code === 85 || code === 86) return "nevando"
  return "con tormenta"
}

/** "14°C, nublado. Probable lluvia a las 16 (70%)." o null si no hay datos. */
export function summarizeForecast(forecast: Forecast): string | null {
  const temp = forecast.current?.temperature_2m
  const code = forecast.current?.weather_code
  if (temp === undefined || code === undefined) return null

  const now = `${Math.round(temp)}°C, ${describeCode(code)}.`
  const times = forecast.hourly?.time ?? []
  const probs = forecast.hourly?.precipitation_probability ?? []
  const rainAt = probs.findIndex((p) => p >= RAIN_PROBABILITY)
  if (rainAt < 0 || describeCode(code) === "lloviendo") return now
  // Open-Meteo devuelve la hora local del lugar ("2026-10-17T16:00").
  const hour = times[rainAt]?.slice(11, 13)
  return hour ? `${now} Probable lluvia a las ${Number(hour)} (${probs[rainAt]}%).` : now
}

const cache = new Map<string, { at: number; summary: string | null }>()

export async function getWeatherSummary(location: LatLng): Promise<string | null> {
  const key = `${location.lat.toFixed(1)},${location.lng.toFixed(1)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.summary

  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lng),
    current: "temperature_2m,weather_code",
    hourly: "precipitation_probability",
    forecast_hours: String(FORECAST_HOURS),
    timezone: "auto",
  })
  try {
    const res = await fetch(`${FORECAST_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const summary = summarizeForecast((await res.json()) as Forecast)
    cache.set(key, { at: Date.now(), summary })
    return summary
  } catch (err) {
    console.error("[weather]", err instanceof Error ? err.message : err)
    return null
  }
}
