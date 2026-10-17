/**
 * Eventos de París desde "Que faire à Paris" (datos abiertos de la ciudad, gratis y
 * sin key). Lo puro (ventana de tiempo, funciones, elegir) se testea solo;
 * `fetchParisEvents` hace una sola consulta ya filtrada por zona, fecha y tipo.
 */
import { zonedDateKey, zonedTimeToIso } from "@/lib/time/zoned"

const RECORDS_URL = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records"
const TIMEOUT_MS = 5_000
const RADIUS_KM = 3
/** Se piden más de los que se devuelven: muchos no tienen función dentro de la ventana. */
const FETCH_LIMIT = 40
export const MAX_EVENTS = 3
/** "Ahora" = lo que está pasando o empieza en las próximas horas. */
export const NOW_WINDOW_HOURS = 3
/** `date_start`/`date_end` vienen con offsets inconsistentes: se filtra grueso y se afina con `occurrences`. */
const PREFILTER_SLACK_MS = 3 * 60 * 60 * 1000

/** Tipo de evento que puede pedir el agente → etiquetas de Que faire à Paris. */
export const EVENT_KINDS = {
  música: ["Concert", "Spectacle musical"],
  teatro: ["Théâtre", "Humour", "Cirque"],
  danza: ["Danse"],
  exposición: ["Expo", "Art contemporain", "Photo", "Peinture"],
  cine: ["Ecrans"],
  charla: ["Conférence"],
  taller: ["Atelier"],
  paseo: ["Balade urbaine"],
  niños: ["Enfants"],
  deporte: ["Sport"],
  noche: ["Nuit"],
} as const
export type EventKind = keyof typeof EVENT_KINDS
export const EVENT_KIND_NAMES = Object.keys(EVENT_KINDS) as [EventKind, ...EventKind[]]

export type EventWhen = "now" | "today" | "tomorrow"
export type TimeWindow = { from: Date; to: Date }

export type QfapRecord = {
  id: string
  title: string
  lead_text: string | null
  url: string | null
  date_start: string | null
  date_end: string | null
  occurrences: string | null
  address_name: string | null
  qfap_tags: string | null
  price_type: string | null
  lat_lon: { lat: number; lon: number } | null
}

export type ParisEvent = {
  id: string
  title: string
  summary: string | null
  url: string | null
  venue: string
  lat: number
  lng: number
  startsAt: string
  endsAt: string
  free: boolean
  tags: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function nextDayKey(dateKey: string): string {
  return new Date(new Date(`${dateKey}T12:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10)
}

/** Desde cuándo hasta cuándo buscar, en la zona del viaje. */
export function eventWindow(when: EventWhen, now: Date, timeZone: string): TimeWindow {
  const today = zonedDateKey(now, timeZone)
  const tomorrow = nextDayKey(today)
  switch (when) {
    case "now":
      return { from: now, to: new Date(now.getTime() + NOW_WINDOW_HOURS * 60 * 60 * 1000) }
    case "today":
      return { from: now, to: new Date(zonedTimeToIso(tomorrow, "00:00", timeZone)) }
    case "tomorrow":
      return {
        from: new Date(zonedTimeToIso(tomorrow, "00:00", timeZone)),
        to: new Date(zonedTimeToIso(nextDayKey(tomorrow), "00:00", timeZone)),
      }
  }
}

/**
 * Funciones del evento. Vienen como "2026-10-17T14:00:00+02:00_2026-10-17T21:00:00+02:00;…",
 * con la hora de París bien pero el offset no siempre (en invierno también dice +02:00),
 * así que se toma la hora de pared y se ubica en la zona.
 */
export function parseOccurrences(raw: string | null, timeZone: string): { start: Date; end: Date }[] {
  if (!raw) return []
  return raw.split(";").flatMap((pair) => {
    const [start, end] = pair.split("_").map((s) => /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s.trim()))
    if (!start || !end) return []
    try {
      return [
        {
          start: new Date(zonedTimeToIso(start[1], start[2], timeZone)),
          end: new Date(zonedTimeToIso(end[1], end[2], timeZone)),
        },
      ]
    } catch {
      return []
    }
  })
}

/** Primera función que se cruza con la ventana (y no terminó), o null. */
export function firstOccurrenceIn(
  occurrences: { start: Date; end: Date }[],
  window: TimeWindow
): { start: Date; end: Date } | null {
  return (
    occurrences
      .filter((o) => o.end > window.from && o.start < window.to)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null
  )
}

/** Los eventos con función en la ventana y con un lugar concreto, en el orden de la consulta (por distancia). */
export function pickEvents(records: QfapRecord[], window: TimeWindow, timeZone: string, max = MAX_EVENTS): ParisEvent[] {
  const events: ParisEvent[] = []
  for (const r of records) {
    if (!r.address_name || !r.lat_lon) continue
    const occurrence = firstOccurrenceIn(parseOccurrences(r.occurrences, timeZone), window)
    if (!occurrence) continue
    events.push({
      id: r.id,
      title: r.title,
      summary: r.lead_text,
      url: r.url,
      venue: r.address_name,
      lat: r.lat_lon.lat,
      lng: r.lat_lon.lon,
      startsAt: occurrence.start.toISOString(),
      endsAt: occurrence.end.toISOString(),
      free: r.price_type === "gratuit",
      tags: (r.qfap_tags ?? "").split(";").filter(Boolean),
    })
    if (events.length >= max) break
  }
  return events
}

const quote = (s: string) => `"${s.replace(/"/g, "")}"`

/** Filtro ODSQL: zona, fechas (con margen) y, si se pidió, tipo y gratis. */
export function buildWhere(
  near: { lat: number; lng: number },
  window: TimeWindow,
  kind: EventKind | null,
  freeOnly: boolean
): string {
  const from = new Date(window.from.getTime() - PREFILTER_SLACK_MS).toISOString()
  const to = new Date(window.to.getTime() + PREFILTER_SLACK_MS).toISOString()
  const clauses = [
    `date_end >= ${quote(from)}`,
    `date_start <= ${quote(to)}`,
    `within_distance(lat_lon, geom'POINT(${near.lng} ${near.lat})', ${RADIUS_KM}km)`,
  ]
  if (kind) clauses.push(`(${EVENT_KINDS[kind].map((t) => `qfap_tags like ${quote(`%${t}%`)}`).join(" OR ")})`)
  if (freeOnly) clauses.push(`price_type = "gratuit"`)
  return clauses.join(" AND ")
}

const cache = new Map<string, { at: number; events: ParisEvent[] }>()
const CACHE_MS = 10 * 60 * 1000

/** Hasta 3 eventos cerca, ordenados por distancia. Lanza si la API falla. */
export async function fetchParisEvents(opts: {
  near: { lat: number; lng: number }
  when: EventWhen
  kind: EventKind | null
  freeOnly: boolean
  now: Date
  timeZone: string
}): Promise<ParisEvent[]> {
  const { near, when, kind, freeOnly, now, timeZone } = opts
  const key = `${when}|${kind}|${freeOnly}|${near.lat.toFixed(2)},${near.lng.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.events

  const window = eventWindow(when, now, timeZone)
  const params = new URLSearchParams({
    where: buildWhere(near, window, kind, freeOnly),
    order_by: `distance(lat_lon, geom'POINT(${near.lng} ${near.lat})')`,
    limit: String(FETCH_LIMIT),
    select: "id,title,lead_text,url,date_start,date_end,occurrences,address_name,qfap_tags,price_type,lat_lon",
  })
  const res = await fetch(`${RECORDS_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Que faire à Paris ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { results?: QfapRecord[] }

  const events = pickEvents(body.results ?? [], window, timeZone)
  cache.set(key, { at: Date.now(), events })
  return events
}
