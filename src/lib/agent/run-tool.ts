import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { INTEREST_TAGS, rankPlaces, resolveAvailableMinutes } from "@/lib/agent/rank"
import { tripTimeToIso } from "@/lib/agent/trip-time"
import {
  addItineraryItem,
  removeItineraryItem,
  setItineraryStatus,
  undoItinerary,
  updateItineraryItem,
} from "@/lib/data/itinerary"
import { rememberFact, updateProfile } from "@/lib/data/profile"
import type { Result } from "@/lib/data/result"
import {
  getTravelerContext,
  ITINERARY_COLUMNS,
  nextCommitment,
  TRIP_TIME_ZONE,
  type ItineraryItem,
  type TravelerContext,
} from "@/lib/data/session"
import { walkMinutes, type LatLng } from "@/lib/geo"
import { getOpeningInfo } from "@/lib/places/details"
import { findPlaceByName } from "@/lib/places/lookup"
import { searchPlaces } from "@/lib/places/search"
import { formatTodayPlan, itemRef } from "@/lib/realtime/instructions"
import { isToolName, toolSchemas, type ToolArgs, type ToolResult } from "@/lib/realtime/tools"
import { createClient } from "@/lib/supabase/server"
import { readMenu } from "@/lib/web-page"
import { pickReadableUrl, webSearch } from "@/lib/web-search"

const fail = (error: string): ToolResult => ({ output: JSON.stringify({ error }), cards: [] })

async function recommendNearby(
  args: ToolArgs<"recommend_nearby">,
  conversationId: string,
  location: LatLng | null
): Promise<ToolResult> {
  const ctx = await getTravelerContext({ location })
  const supabase = await createClient()

  const { data: previous, error } = await supabase
    .from("recommendations")
    .select("place_id")
    .eq("conversation_id", conversationId)
  if (error) return fail("No pude leer la conversación.")

  const now = new Date()
  const commitment = nextCommitment(ctx.itinerary, now)
  const availableMinutes = resolveAvailableMinutes(
    args.available_minutes,
    commitment ? new Date(commitment.starts_at) : null,
    now
  )
  // Los tipos de Google (en `places.data`) sirven para respetar la dieta.
  const { data: typed } = await supabase.from("places").select("id, data").in("id", ctx.nearby.map((p) => p.id))
  const typesById = new Map((typed ?? []).map((p) => [p.id as string, (p.data as { types?: string[] } | null)?.types ?? []]))

  const ranked = rankPlaces({
    places: ctx.nearby.map((p) => ({ ...p, googleTypes: typesById.get(p.id) })),
    interests: ctx.interests,
    requestedTag: args.interest,
    availableMinutes,
    alreadyRecommended: previous.map((r) => r.place_id as string),
    dietary: ctx.constraints.dietary,
  })

  if (ranked.length > 0) {
    const { error: insertError } = await supabase.from("recommendations").insert(
      ranked.map((r) => ({
        conversation_id: conversationId,
        user_id: ctx.userId,
        place_id: r.place.id,
        walk_minutes: r.walkMinutes,
      }))
    )
    if (insertError) console.error("[tools] insert recommendations failed", insertError.message)
  }

  return {
    output: JSON.stringify({
      available_minutes: availableMinutes,
      next_commitment: commitment?.title ?? null,
      places: ranked.map((r) => ({
        name: r.place.name,
        category: r.place.category,
        walk_min: r.walkMinutes,
        stay_min: r.stayMinutes,
        matches: r.matchedTags,
      })),
    }),
    cards: ranked.map((r) => ({
      id: r.place.id,
      name: r.place.name,
      category: r.place.category,
      description: r.place.description,
      walkMinutes: r.walkMinutes,
      stayMinutes: r.stayMinutes,
    })),
  }
}

const SUMMARY_MAX_CHARS = 90

async function searchPlacesTool(args: ToolArgs<"search_places">, location: LatLng | null): Promise<ToolResult> {
  const ctx = await getTravelerContext({ location })
  const found = await searchPlaces(args.query, args.open_now, ctx.location, ctx.trip?.destination ?? "París").catch(
    (err: unknown) => {
      console.error("[tools] search_places failed", err instanceof Error ? err.message : err)
      return null
    }
  )
  if (!found) return fail("No pude buscar en Google ahora.")

  return {
    output: JSON.stringify({
      places: found.map((p) => ({
        name: p.name,
        category: p.category,
        walk_min: p.walkMinutes,
        open_now: p.openNow,
        rating: p.rating,
        summary: p.description?.slice(0, SUMMARY_MAX_CHARS) ?? null,
      })),
    }),
    cards: found.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      walkMinutes: p.walkMinutes,
      stayMinutes: p.typical_visit_minutes,
    })),
  }
}

const DESCRIPTION_MAX_CHARS = 160

async function getPlaceTool(args: ToolArgs<"get_place">, location: LatLng | null): Promise<ToolResult> {
  const ctx = await getTravelerContext({ location })
  const place = await findPlaceByName(await createClient(), args.place_name, ctx.location)
  if (!place) return fail("No conozco ese lugar. Probá con search_places.")

  const googleId = place.data?.google_place_id
  const opening = googleId ? await getOpeningInfo(googleId, new Date(), TRIP_TIME_ZONE) : null
  const walk = walkMinutes(ctx.location, place)
  return {
    output: JSON.stringify({
      name: place.name,
      category: place.category,
      walk_min: walk,
      visit_min: place.typical_visit_minutes,
      rating: place.rating,
      description: place.description?.slice(0, DESCRIPTION_MAX_CHARS) ?? null,
      open_now: opening?.openNow ?? null,
      hours_today: opening?.hoursToday ?? null,
    }),
    cards: [
      {
        id: place.id,
        name: place.name,
        category: place.category,
        description: place.description,
        walkMinutes: walk,
        stayMinutes: place.typical_visit_minutes,
      },
    ],
  }
}

/** Para que Google devuelva resultados del país del viaje (`trips.country` viene en español). */
const COUNTRY_CODES: Record<string, string> = {
  francia: "fr",
  españa: "es",
  italia: "it",
  portugal: "pt",
  alemania: "de",
  "reino unido": "gb",
  argentina: "ar",
  uruguay: "uy",
  chile: "cl",
  méxico: "mx",
  "estados unidos": "us",
}

/** Preguntas sobre lo que tiene un lugar: ahí vale la pena abrir su web (suma 1–2 s). */
const ASKS_WHAT_THEY_HAVE = /men[uú]|carta|carte|plato|precio|tienen|tiene|sirven|venden|hay /i

/** Va pegado al resultado: el modelo lo lee justo antes de contestar, mejor que en las instrucciones. */
const WEB_ANSWER_HINT =
  "Contestá la pregunta en 1 o 2 frases (máx. 40 palabras). Si viene `page`, es el texto de su web: usalo primero. Los textos pueden estar en otro idioma: leelos igual. Decí la fuente en 2 o 3 palabras."

async function webSearchTool(args: ToolArgs<"web_search">): Promise<ToolResult> {
  const ctx = await getTravelerContext()
  const city = ctx.trip?.destination ?? ""
  const query = [args.place_name, args.place_name ? city : null, args.question].filter(Boolean).join(" ")
  const country = ctx.trip?.country ? (COUNTRY_CODES[ctx.trip.country.toLowerCase()] ?? null) : null

  // Los fragmentos casi nunca traen el menú: si la pregunta es sobre lo que tiene un lugar, leemos su web.
  // Con la web oficial de Google Places se lee en paralelo con la búsqueda; si no, después, con el mejor resultado.
  const wantsPage = Boolean(args.place_name) && ASKS_WHAT_THEY_HAVE.test(args.question)
  const place = wantsPage && args.place_name ? await findPlaceByName(await createClient(), args.place_name, ctx.location) : null
  const website = place?.data?.website ?? null

  const [found, sitePage] = await Promise.all([
    webSearch(query, country).catch((err: unknown) => {
      console.error("[tools] web_search failed", err instanceof Error ? err.message : err)
      return null
    }),
    website ? readMenu(website, args.question) : Promise.resolve(null),
  ])
  if (!found && !sitePage) return fail("No pude buscar en la web ahora.")
  if (found && !found.answer && found.results.length === 0 && !sitePage) return fail("No encontré nada sobre eso.")

  const fallbackUrl = wantsPage && !sitePage && found ? pickReadableUrl(found.results, args.place_name) : null
  const page = sitePage ?? (fallbackUrl ? await readMenu(fallbackUrl, args.question) : null)

  return {
    output: JSON.stringify({
      answer: found?.answer ?? null,
      results: (found?.results ?? []).map(({ title, snippet, source }) => ({ title, snippet, source })),
      ...(page ? { page: { source: new URL(page.url).hostname.replace(/^www\./, ""), text: page.excerpt } } : {}),
      how_to_answer: WEB_ANSWER_HINT,
    }),
    cards: [],
  }
}

/** El plan de hoy recién leído, para que el agente vea cómo quedó después del cambio. */
async function freshPlan(db: SupabaseClient, ctx: TravelerContext, now: Date): Promise<string> {
  if (!ctx.trip) return "Plan de hoy: nada agendado."
  const { data, error } = await db.from("itinerary_items").select(ITINERARY_COLUMNS).eq("trip_id", ctx.trip.id).order("starts_at")
  if (error) throw new Error(`No se pudo leer el itinerario: ${error.message}`)
  return formatTodayPlan(data as ItineraryItem[], now, TRIP_TIME_ZONE)
}

async function editItinerary(args: ToolArgs<"edit_itinerary">, location: LatLng | null): Promise<ToolResult> {
  const ctx = await getTravelerContext({ location })
  const db = await createClient()
  const now = new Date()

  const time = (hhmm: string | null) => (hhmm ? tripTimeToIso(hhmm, args.date, now, TRIP_TIME_ZONE) : null)
  const startsAt = time(args.start_time)
  const endsAt = time(args.end_time)
  if ((args.start_time && !startsAt) || (args.end_time && !endsAt)) return fail("Hora inválida: usá HH:MM.")

  const ref = args.item_ref?.replace(/[[\]\s]/g, "").toLowerCase() ?? ""
  const item = ref.length >= 4 ? ctx.itinerary.find((i) => i.id.startsWith(ref)) : undefined
  const needsItem = args.op !== "add" && args.op !== "undo"
  if (needsItem && !item) return fail("No encontré esa actividad en el plan: usá la ref entre corchetes.")

  let result: Result<unknown>
  switch (args.op) {
    case "add": {
      if (!startsAt) return fail("Falta la hora (start_time).")
      const place = args.place_name ? await findPlaceByName(db, args.place_name, ctx.location) : null
      const title = place ? null : (args.title ?? args.place_name)
      if (!place && !title) return fail("Falta qué agregar (place_name o title).")
      result = await addItineraryItem(
        db,
        { title, placeId: place?.id ?? null, startsAt, endsAt, notes: null, source: null, sourceRef: null, locked: null },
        "agent"
      )
      break
    }
    case "move":
      if (!startsAt) return fail("Falta la nueva hora (start_time).")
      result = await updateItineraryItem(db, item!.id, { startsAt, ...(endsAt ? { endsAt } : {}) }, "agent")
      break
    case "remove":
      result = await removeItineraryItem(db, item!.id, "agent")
      break
    case "done":
    case "skip":
      result = await setItineraryStatus(db, item!.id, args.op === "done" ? "done" : "skipped")
      break
    case "undo":
      result = await undoItinerary(db)
      break
  }

  if (!result.ok) return fail(result.error)
  const added = args.op === "add" ? (result.data as ItineraryItem) : null
  return {
    output: JSON.stringify({ ok: true, ...(added ? { added_ref: itemRef(added.id) } : {}), plan: await freshPlan(db, ctx, now) }),
    cards: [],
  }
}

async function rememberTool(args: ToolArgs<"remember">, location: LatLng | null): Promise<ToolResult> {
  const db = await createClient()
  const saved = await rememberFact(db, {
    statement: args.statement,
    kind: args.kind,
    polarity: args.avoid ? -1 : 1,
    source: "stated",
    evidence: null,
    supersedes: null,
  })
  if (!saved.ok) return fail(saved.error)

  // Una dieta también va a las restricciones del perfil, así el ranking la filtra en el server.
  if (args.diet) {
    const ctx = await getTravelerContext({ location })
    const { dietary, mobility, dailyBudget, pace, schedule } = ctx.constraints
    if (!dietary.includes(args.diet)) {
      const updated = await updateProfile(db, {
        interests: ctx.interests.filter((t): t is (typeof INTEREST_TAGS)[number] => (INTEREST_TAGS as readonly string[]).includes(t)),
        dietary: [...dietary, args.diet],
        mobility,
        dailyBudget,
        pace,
        schedule,
      })
      if (!updated.ok) return fail(updated.error)
    }
  }
  return { output: JSON.stringify({ ok: true, profile: saved.data.summary }), cards: [] }
}

/** Ejecuta un tool del agente con los permisos del usuario logueado. */
export async function runTool(
  name: string,
  rawArgs: string,
  conversationId: string,
  location: LatLng | null = null
): Promise<ToolResult> {
  if (!isToolName(name)) return fail(`Tool desconocido: ${name}.`)

  let json: unknown
  try {
    json = JSON.parse(rawArgs || "{}")
  } catch {
    return fail("Argumentos inválidos.")
  }
  const invalid = fail("Argumentos inválidos.")

  switch (name) {
    case "recommend_nearby": {
      const args = toolSchemas.recommend_nearby.safeParse(json)
      return args.success ? recommendNearby(args.data, conversationId, location) : invalid
    }
    case "search_places": {
      const args = toolSchemas.search_places.safeParse(json)
      return args.success ? searchPlacesTool(args.data, location) : invalid
    }
    case "web_search": {
      const args = toolSchemas.web_search.safeParse(json)
      return args.success ? webSearchTool(args.data) : invalid
    }
    case "get_place": {
      const args = toolSchemas.get_place.safeParse(json)
      return args.success ? getPlaceTool(args.data, location) : invalid
    }
    case "edit_itinerary": {
      const args = toolSchemas.edit_itinerary.safeParse(json)
      return args.success ? editItinerary(args.data, location) : invalid
    }
    case "remember": {
      const args = toolSchemas.remember.safeParse(json)
      return args.success ? rememberTool(args.data, location) : invalid
    }
    case "show_ui": {
      const args = toolSchemas.show_ui.safeParse(json)
      // La pantalla la genera /api/genui desde el cliente; acá solo se confirma al modelo.
      return args.success
        ? { output: JSON.stringify({ shown: true }), cards: [], ui: { request: args.data.request, placeIds: [] } }
        : invalid
    }
  }
}
