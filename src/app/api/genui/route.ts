import { z } from "zod"

import type { Place } from "@/lib/agent/types"
import { getTravelerContext, NEARBY_RADIUS_METERS } from "@/lib/data/session"
import { boundingBox, walkMinutes } from "@/lib/geo"
import { buildGenUiUserMessage, namedPlaceIds, screenPlaces } from "@/lib/genui/context"
import { buildGenUiLibrary, GENUI_COMPONENTS, GENUI_EXAMPLES } from "@/lib/genui/library"
import { genUiProvider, streamCompletion } from "@/lib/genui/provider"
import { GENUI_DATA_PREFIX, type GenUiData, type GenUiPlace } from "@/lib/genui/types"
import { latLngSchema } from "@/lib/location/schema"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { getWeatherSummary } from "@/lib/weather"
import { createClient } from "@/lib/supabase/server"
import { zonedDateKey, zonedTimeValue } from "@/lib/time/zoned"

const MAX_PLACES = 6
/** Cada recomendación y cada "Llevame" piden una pantalla. */
const MAX_SCREENS_PER_MINUTE = 20
const TIMEOUT_MS = 15_000

const bodySchema = z.object({
  request: z.string().trim().min(1).max(300),
  placeIds: z.array(z.string().min(1).max(200)).max(6).default([]),
  location: latLngSchema.nullable().default(null),
})

// El prompt de la biblioteca es siempre el mismo: se arma una vez (y el proveedor lo cachea).
const SYSTEM_PROMPT = buildGenUiLibrary(
  Object.fromEntries(GENUI_COMPONENTS.map((name) => [name, null])) as Record<(typeof GENUI_COMPONENTS)[number], null>
).prompt({
  preamble:
    "Sos el diseñador de pantallas de Rumbo, un guía de viaje por voz. La voz ya respondió; vos armás la pantalla que la acompaña. Escribí SOLO OpenUI Lang, sin explicaciones ni bloques de código.",
  additionalRules: [
    "Pantallas cortas: 2 a 4 bloques. Empezá con Say.",
    "Usá solo ids que aparecen en places. Si el pedido nombra un lugar, buscalo por nombre en places.",
    "places son los lugares que el agente de voz está nombrando, en su orden: mostrá esos y ninguno más. El primero es el principal (PlaceHero, o destino de RouteMap si pide cómo llegar); los demás van en PlaceList, o en Compare si pide comparar.",
    "Say y PlaceHero hablan del MISMO lugar. El reason de PlaceHero explica por qué ESE lugar, sin nombrar otros.",
    "Cada sentencia en UNA sola línea: nunca partas un array en varias líneas.",
    "Timeline: todas las paradas son después de local_time, en orden, y respetan las actividades de itinerary_today (usá su título exacto, con placeId null).",
    "Weather solo si el clima importa para el pedido.",
    "Textos en español rioplatense.",
  ],
  examples: GENUI_EXAMPLES,
})

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
})

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
  const columns = "id, name, category, tags, description, lat, lng, rating, typical_visit_minutes"
  let placeIds = parsed.data.placeIds
  let rows: Place[]
  if (placeIds.length > 0) {
    const { data } = await supabase.from("places").select(columns).in("id", placeIds)
    rows = (data ?? []) as Place[]
  } else {
    const box = boundingBox(ctx.location, NEARBY_RADIUS_METERS)
    const { data } = await supabase
      .from("places")
      .select(columns)
      .gte("lat", box.minLat)
      .lte("lat", box.maxLat)
      .gte("lng", box.minLng)
      .lte("lng", box.maxLng)
    rows = (data ?? []) as Place[]
    placeIds = namedPlaceIds(parsed.data.request, rows)
  }
  const places = screenPlaces(
    rows.map((p) => toGenUiPlace(p, ctx.location)),
    placeIds,
    MAX_PLACES
  )
  if (places.length === 0) return Response.json({ error: "No hay lugares para mostrar." }, { status: 422 })
  const now = new Date()
  const today = zonedDateKey(now, ctx.timeZone)
  const itinerary = ctx.itinerary
    .filter((i) => zonedDateKey(new Date(i.starts_at), ctx.timeZone) === today && i.status !== "skipped")
    .map((i) => ({ time: zonedTimeValue(i.starts_at, ctx.timeZone), title: i.title, locked: i.locked }))

  const data: GenUiData = {
    origin: ctx.location,
    places: Object.fromEntries(places.map((p) => [p.id, p])),
    weather: weather ?? (location ? null : await getWeatherSummary(ctx.location)),
    itineraryTitles: itinerary.map((i) => i.title),
  }
  const user = buildGenUiUserMessage({
    request: parsed.data.request,
    places,
    itinerary,
    weather: data.weather,
    localTime: zonedTimeValue(now.toISOString(), ctx.timeZone),
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
