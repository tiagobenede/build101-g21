import { z } from "zod"

import type { Place } from "@/lib/agent/types"
import { getTravelerContext, NEARBY_RADIUS_METERS } from "@/lib/data/session"
import { boundingBox, walkMinutes } from "@/lib/geo"
import { buildGenUiUserMessage, namedPlaceIds, screenPlaces } from "@/lib/genui/context"
import { buildGenUiLibrary, GENUI_COMPONENTS, GENUI_EXAMPLES } from "@/lib/genui/library"
import { genUiProvider, streamCompletion } from "@/lib/genui/provider"
import { GENUI_DATA_PREFIX, type GenUiData, type GenUiPlace } from "@/lib/genui/types"
import { latLngSchema } from "@/lib/location/schema"
import { getOpeningInfo } from "@/lib/places/details"
import { closingInfo } from "@/lib/places/opening"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { getWeatherSummary } from "@/lib/weather"
import { createClient } from "@/lib/supabase/server"
import { zonedDateKey, zonedTimeValue } from "@/lib/time/zoned"

const MAX_PLACES = 6
/** Cada recomendación y cada "Llevame" piden una pantalla. */
const MAX_SCREENS_PER_MINUTE = 20
const TIMEOUT_MS = 15_000
/** Los horarios de Google no frenan la pantalla: si tardan más, va sin ellos. */
const OPENING_TIMEOUT_MS = 1_500

const bodySchema = z.object({
  request: z.string().trim().min(1).max(300),
  placeIds: z.array(z.string().min(1).max(200)).max(6).default([]),
  location: latLngSchema.nullable().default(null),
  story: z
    .object({ subject: z.string().max(160), facts: z.array(z.string().max(300)).max(5), anecdote: z.string().max(400).nullable() })
    .nullable()
    .default(null),
  seen: z
    .object({
      name: z.string().max(160),
      kind: z.enum(["lugar", "obra", "otro"]),
      where: z.string().max(160).nullable(),
      description: z.string().max(600).nullable(),
      placeId: z.string().max(200).nullable(),
    })
    .nullable()
    .default(null),
  phrase: z
    .object({
      text: z.string().max(300),
      translation: z.string().max(300),
      pronunciation: z.string().max(300).nullable(),
      lang: z.string().max(20),
    })
    .nullable()
    .default(null),
})

// El prompt de la biblioteca es siempre el mismo: se arma una vez (y el proveedor lo cachea).
const SYSTEM_PROMPT = buildGenUiLibrary(
  Object.fromEntries(GENUI_COMPONENTS.map((name) => [name, null])) as Record<(typeof GENUI_COMPONENTS)[number], null>
).prompt({
  preamble:
    "Sos el diseñador de pantallas de Polo, un guía de viaje por voz. La voz ya respondió; vos armás la pantalla que la acompaña. Escribí SOLO OpenUI Lang, sin explicaciones ni bloques de código.",
  additionalRules: [
    "Pantallas cortas: 2 a 4 bloques. Empezá con Say (salvo con seen), con una frase propia para este pedido: nunca copies la de un ejemplo.",
    "Usá solo ids que aparecen en places. Si el pedido nombra un lugar, buscalo por nombre en places.",
    "places son los lugares que el agente de voz está nombrando, en su orden: mostrá esos y ninguno más. El primero es el principal (PlaceHero, o destino de RouteMap si pide cómo llegar); los demás van en PlaceList, o en Compare si pide comparar.",
    "Si el pedido es 'Llevame a…' o cómo llegar: Say corto sin minutos ni metros (el mapa muestra los de la ruta real) y RouteMap del primero, nada más.",
    "Say y PlaceHero hablan del MISMO lugar. El reason de PlaceHero explica por qué ESE lugar, sin nombrar otros.",
    "Cada sentencia en UNA sola línea: nunca partas un array en varias líneas.",
    "Timeline: todas las paradas son después de local_time, en orden, y respetan las actividades de itinerary_today (usá su título exacto, con placeId null).",
    "Weather solo si el clima importa para el pedido.",
    "Si hay phrase: Say corto y Phrase(), sin lugares salvo que el pedido los nombre.",
    "Si hay story: Say corto y Story(); si también hay un lugar en places, PlaceHero después.",
    "Si hay seen: Seen() primero; si hay story, Story() después. Sin PlaceHero del mismo lugar (Seen ya lo muestra).",
    "Si un lugar está cerrado (open_now false) o cierra pronto (closes_in_min chico), no lo pongas como principal sin decirlo en Say.",
    "Textos en español rioplatense.",
  ],
  examples: GENUI_EXAMPLES,
})

type PlaceWithData = Place & { data: Record<string, unknown> | null }

const toGenUiPlace = (p: Place, origin: { lat: number; lng: number }): GenUiPlace => ({
  id: p.id,
  name: p.name,
  category: p.category,
  tags: p.tags,
  description: p.description,
  rating: p.rating,
  walkMinutes: walkMinutes(origin, p),
  visitMinutes: p.typical_visit_minutes,
  lat: p.lat,
  lng: p.lng,
  photoUrl: `/api/places/photo/${encodeURIComponent(p.id)}`,
  openNow: null,
  hoursToday: null,
  closesAt: null,
  closesInMinutes: null,
})

/** Suma si está abierto y cuándo cierra (Google, cacheado). Lo que tarda o falla queda en null. */
async function withOpening(place: GenUiPlace, googleId: unknown, localTime: string, timeZone: string): Promise<GenUiPlace> {
  if (typeof googleId !== "string") return place
  const info = await Promise.race([
    getOpeningInfo(googleId, new Date(), timeZone),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), OPENING_TIMEOUT_MS)),
  ])
  if (!info) return place
  const closing = info.openNow === false ? null : closingInfo(info.hoursToday, localTime)
  return {
    ...place,
    openNow: info.openNow,
    hoursToday: info.hoursToday,
    closesAt: closing?.closesAt ?? null,
    closesInMinutes: closing?.closesInMinutes ?? null,
  }
}

/**
 * Genera la pantalla que acompaña una respuesta de voz (UI generativa con OpenUI).
 * Responde en streaming: primera línea `DATA:{json}` con los lugares, después OpenUI Lang.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 })

  const provider = genUiProvider()
  if (!provider) return Response.json({ error: "Falta GROQ_API_KEY u OPENAI_API_KEY." }, { status: 500 })

  const t0 = performance.now()
  const location = parsed.data.location
  // El clima no depende del contexto: se pide en paralelo (y queda cacheado).
  const [ctx, weather] = await Promise.all([
    getTravelerContext({ location }),
    location ? getWeatherSummary(location) : Promise.resolve(null),
  ])
  const ctxMs = Math.round(performance.now() - t0)
  if (!allowRequest(`genui:${ctx.userId}`, MAX_SCREENS_PER_MINUTE)) return Response.json({ error: "Demasiados pedidos seguidos." }, { status: 429 })

  // Solo los lugares que eligió el agente (los de su último tool). Sin ids (pruebas en desarrollo),
  // los que el pedido nombra. Nunca se completa con otros: pantalla y voz dicen lo mismo.
  const supabase = await createClient()
  const columns = "id, name, category, tags, description, lat, lng, rating, typical_visit_minutes, data"
  const { story, seen, phrase } = parsed.data
  let placeIds = parsed.data.placeIds
  if (seen?.placeId && !placeIds.includes(seen.placeId)) placeIds = [seen.placeId, ...placeIds]
  let rows: PlaceWithData[]
  if (placeIds.length > 0) {
    const { data } = await supabase.from("places").select(columns).in("id", placeIds)
    rows = (data ?? []) as PlaceWithData[]
  } else {
    const box = boundingBox(ctx.location, NEARBY_RADIUS_METERS)
    const { data } = await supabase
      .from("places")
      .select(columns)
      .gte("lat", box.minLat)
      .lte("lat", box.maxLat)
      .gte("lng", box.minLng)
      .lte("lng", box.maxLng)
    rows = (data ?? []) as PlaceWithData[]
    placeIds = namedPlaceIds(parsed.data.request, rows)
  }
  const now = new Date()
  const localTime = zonedTimeValue(now.toISOString(), ctx.timeZone)
  const googleIds = new Map(rows.map((p) => [p.id, p.data?.google_place_id]))
  const places = await Promise.all(
    screenPlaces(
      rows.map((p) => toGenUiPlace(p, ctx.location)),
      placeIds,
      MAX_PLACES
    ).map((p) => withOpening(p, googleIds.get(p.id), localTime, ctx.timeZone))
  )
  // Una frase, una historia o una foto se muestran aunque no haya lugares.
  if (places.length === 0 && !story && !seen && !phrase)
    return Response.json({ error: "No hay lugares para mostrar." }, { status: 422 })
  const today = zonedDateKey(now, ctx.timeZone)
  const itinerary = ctx.itinerary
    .filter((i) => zonedDateKey(new Date(i.starts_at), ctx.timeZone) === today && i.status !== "skipped")
    .map((i) => ({ time: zonedTimeValue(i.starts_at, ctx.timeZone), title: i.title, locked: i.locked }))

  const data: GenUiData = {
    origin: ctx.location,
    places: Object.fromEntries(places.map((p) => [p.id, p])),
    weather: weather ?? (location ? null : await getWeatherSummary(ctx.location)),
    itineraryTitles: itinerary.map((i) => i.title),
    story,
    seen: seen && { ...seen, placeId: seen.placeId && places.some((p) => p.id === seen.placeId) ? seen.placeId : null },
    phrase,
  }
  const user = buildGenUiUserMessage({
    request: parsed.data.request,
    places,
    itinerary,
    weather: data.weather,
    localTime,
    story,
    seen: data.seen,
    phrase,
  })

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)])
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${GENUI_DATA_PREFIX}${JSON.stringify(data)}\n`))
      try {
        for await (const delta of streamCompletion(provider, SYSTEM_PROMPT, user, signal)) {
          controller.enqueue(encoder.encode(delta))
        }
      } catch (err) {
        console.error("[genui]", provider.name, err instanceof Error ? err.message : err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-GenUI-Provider": provider.name,
      "Server-Timing": `ctx;dur=${ctxMs}, prep;dur=${Math.round(performance.now() - t0)}`,
    },
  })
}
