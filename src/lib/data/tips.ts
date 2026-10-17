import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { addItineraryItem, type Actor } from "@/lib/data/itinerary"
import { fail, ok, type Result } from "@/lib/data/result"
import type { ItineraryItem } from "@/lib/data/session"

/**
 * Recomendaciones de residentes (`local_tips`): las cards de B-5 y, si hace falta, los
 * tools del agente. Mismo patrón que `itinerary.ts`: cliente del usuario y `Result`.
 */

type TipStatus = "saved" | "dismissed"

/** Guarda o descarta una recomendación. */
export async function setTipStatus(db: SupabaseClient, id: string, status: TipStatus): Promise<Result<{ id: string }>> {
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
      notes: tip.recommender ? `Te lo recomendó ${tip.recommender}: ${tip.what}` : tip.what,
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
