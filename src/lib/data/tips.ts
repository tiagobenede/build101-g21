import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { addItineraryItem, type Actor } from "@/lib/data/itinerary"
import { fail, ok, type Result } from "@/lib/data/result"
import type { ItineraryItem } from "@/lib/data/session"
import { walkMinutes, type LatLng } from "@/lib/geo"
import { recommendedBy, type LocalTipView, type TipStatus } from "@/lib/tips/view"

/**
 * Recomendaciones de residentes (`local_tips`): las cards de B-5 y, si hace falta, los
 * tools del agente. Mismo patrón que `itinerary.ts`: cliente del usuario y `Result`.
 */

/** Lo que el viajero puede elegir desde la card (al plan va por `addTipToPlan`). */
type ChosenStatus = "saved" | "dismissed"

/** Guarda o descarta una recomendación. */
export async function setTipStatus(db: SupabaseClient, id: string, status: ChosenStatus): Promise<Result<{ id: string }>> {
  if (!z.uuid().safeParse(id).success || !["saved", "dismissed"].includes(status)) return fail("Pedido inválido.")
  const { data, error } = await db.from("local_tips").update({ status }).eq("id", id).select("id").maybeSingle()
  if (error) {
    console.error("[tips] set status", error.message)
    return fail("No pude guardar el cambio.")
  }
  return data ? ok({ id }) : fail("No encontré esa recomendación.")
}

/**
 * Suma la recomendación al itinerario (`source = 'local_tip'`, con la nota de quién la
 * recomendó) y la marca `in_plan`. Necesita que esté anclada a un lugar.
 */
export async function addTipToPlan(db: SupabaseClient, id: string, startsAt: string, actor: Actor): Promise<Result<ItineraryItem>> {
  if (!z.uuid().safeParse(id).success) return fail("Pedido inválido.")
  const { data: tip, error } = await db
    .from("local_tips")
    .select("id, place_id, place_name_raw, recommender, what")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[tips] read", error.message)
    return fail("No pude leer la recomendación.")
  }
  if (!tip) return fail("No encontré esa recomendación.")
  if (!tip.place_id) return fail(`No encontré "${tip.place_name_raw}" en el mapa: buscalo y agregalo a mano.`)

  const added = await addItineraryItem(
    db,
    {
      title: null,
      placeId: tip.place_id as string,
      startsAt,
      endsAt: null,
      notes: `${recommendedBy(tip.recommender)}: ${tip.what}`,
      source: "local_tip",
      sourceRef: tip.id as string,
      locked: null,
    },
    actor
  )
  if (!added.ok) return added

  const { error: statusError } = await db.from("local_tips").update({ status: "in_plan" }).eq("id", id)
  if (statusError) console.error("[tips] mark in_plan", statusError.message)
  return added
}

const MAX_TIPS_LISTED = 10

/**
 * Las recomendaciones de personas locales del viaje (sin las descartadas), la más nueva
 * primero, listas para las cards. `from`: dónde está el viajero, para los minutos a pie.
 */
export async function listLocalTips(db: SupabaseClient, tripId: string | null, from: LatLng): Promise<LocalTipView[]> {
  let query = db
    .from("local_tips")
    .select(
      "id, place_id, place_name_raw, what, why, when_to_go, price_hint, recommender, original_quote, translated_quote, status, places(name, category, lat, lng, typical_visit_minutes)"
    )
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(MAX_TIPS_LISTED)
  if (tripId) query = query.eq("trip_id", tripId)
  const { data, error } = await query
  if (error) {
    console.error("[tips] list", error.message)
    return []
  }

  type PlaceRow = { name: string; category: string; lat: number; lng: number; typical_visit_minutes: number }
  return data.map((t) => {
    const joined = t.places as PlaceRow | PlaceRow[] | null
    const place = Array.isArray(joined) ? (joined[0] ?? null) : joined
    return {
      id: t.id as string,
      placeId: t.place_id as string | null,
      placeName: place?.name ?? (t.place_name_raw as string),
      category: place?.category ?? null,
      what: t.what as string,
      why: t.why as string | null,
      whenToGo: t.when_to_go as string | null,
      priceHint: t.price_hint as string | null,
      recommender: t.recommender as string | null,
      originalQuote: t.original_quote as string | null,
      translatedQuote: t.translated_quote as string | null,
      walkMinutes: place ? walkMinutes(from, place) : null,
      stayMinutes: place?.typical_visit_minutes ?? null,
      status: t.status as TipStatus,
    }
  })
}
