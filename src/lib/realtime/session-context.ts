import "server-only"

import { getTravelerContext, nextCommitment, type TravelerContext } from "@/lib/data/session"
import type { LatLng } from "@/lib/geo"
import { getStreetAddress } from "@/lib/location/reverse"
import { createClient } from "@/lib/supabase/server"
import { recentTranslationLine } from "@/lib/translate/recent"
import { recentTranslation } from "@/lib/translate/server"
import { getWeatherSummary } from "@/lib/weather"

import { buildInstructions, type LocalTipLine } from "./instructions"

const MAX_LOCAL_TIPS = 8

/** Lo último que le recomendaron locales en el viaje (sin lo que descartó). */
async function recentLocalTips(tripId: string | null): Promise<LocalTipLine[]> {
  const supabase = await createClient()
  let query = supabase
    .from("local_tips")
    .select("place_name_raw, what, why, recommender, places(name)")
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(MAX_LOCAL_TIPS)
  if (tripId) query = query.eq("trip_id", tripId)
  const { data, error } = await query
  if (error) {
    console.error("[realtime] local tips", error.message)
    return []
  }
  const byPlace = new Map<string, LocalTipLine>()
  for (const t of data) {
    const place = t.places as { name?: string } | { name?: string }[] | null
    const name = (Array.isArray(place) ? place[0]?.name : place?.name) ?? (t.place_name_raw as string)
    // Si se lo recomendaron dos veces, queda lo más nuevo.
    if (byPlace.has(name)) continue
    byPlace.set(name, { placeName: name, what: t.what as string, why: t.why as string | null, recommender: t.recommender as string | null })
  }
  return [...byPlace.values()]
}

/**
 * Contexto + instrucciones del viajero, igual al abrir la sesión que al refrescarla
 * con `session.update` (un solo camino: si cambia una, cambian las dos).
 */
export async function buildSessionInstructions(location: LatLng | null): Promise<{ ctx: TravelerContext; instructions: string }> {
  const ctx = await getTravelerContext({ location })
  const now = new Date()
  const [weather, localTips, address, translation] = await Promise.all([
    getWeatherSummary(ctx.location),
    recentLocalTips(ctx.trip?.id ?? null),
    getStreetAddress(ctx.location),
    createClient().then((supabase) => recentTranslation(supabase, now)),
  ])
  const instructions = buildInstructions({
    ctx,
    nextCommitment: nextCommitment(ctx.itinerary, now),
    weather,
    address,
    localTips,
    recentTranslation: translation ? recentTranslationLine(translation, now) : null,
    now,
    timeZone: ctx.timeZone,
  })
  return { ctx, instructions }
}
