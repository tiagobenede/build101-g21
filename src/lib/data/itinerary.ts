import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { fail, ok, type Result } from "@/lib/data/result"
import { ITINERARY_COLUMNS, type ItineraryItem, type ItinerarySource } from "@/lib/data/session"
import { activeTripId } from "@/lib/data/trips"

/**
 * Operaciones del itinerario. Un solo camino de código: las usan las server actions
 * de la UI (B-3) y los tools del agente (A-3), cada una con el cliente del usuario
 * logueado, así que los permisos por usuario (RLS) se aplican igual en los dos casos.
 *
 * Antes de cada cambio se guarda una copia del itinerario para poder deshacerlo.
 */

/** Quién pide el cambio. El agente no mueve ni borra reservas (`locked`); el viajero sí. */
export type Actor = "user" | "agent"

const LOCKED_ERROR = "Es una reserva: no la cambio sin que me lo confirmes en la app."

const isoDateTime = z.iso.datetime({ offset: true })

const addSchema = z
  .object({
    title: z.string().trim().min(1).max(120).nullable(),
    placeId: z.string().min(1).max(200).nullable(),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullable(),
    notes: z.string().trim().max(500).nullable(),
    source: z.enum(["user", "agent", "local_tip", "event", "calendar"]).nullable(),
    sourceRef: z.uuid().nullable(),
    locked: z.boolean().nullable(),
  })
  .refine((v) => v.title !== null || v.placeId !== null, "Falta el nombre o el lugar.")

export type AddItemInput = z.input<typeof addSchema>

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  locked: z.boolean().optional(),
})

/** `undefined` = no se toca; `null` en `endsAt`/`notes` = se borra. */
export type UpdateItemInput = z.input<typeof updateSchema>

type StoredItem = ItineraryItem & { trip_id: string }

const endsAfterStart = (startsAt: string, endsAt: string | null) =>
  endsAt === null || new Date(endsAt) > new Date(startsAt)

async function getItem(db: SupabaseClient, id: string): Promise<StoredItem | null> {
  if (!z.uuid().safeParse(id).success) return null
  const { data, error } = await db
    .from("itinerary_items")
    .select(`${ITINERARY_COLUMNS}, trip_id`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la actividad: ${error.message}`)
  return data as StoredItem | null
}

async function snapshot(db: SupabaseClient, tripId: string): Promise<void> {
  const { error } = await db.rpc("snapshot_itinerary", { p_trip_id: tripId })
  if (error) throw new Error(`No se pudo guardar la copia del itinerario: ${error.message}`)
}

async function guarded<T>(label: string, run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run()
  } catch (err) {
    console.error(`[itinerary] ${label}`, err instanceof Error ? err.message : err)
    return fail("No pude cambiar el itinerario. Probá de nuevo.")
  }
}

/** Agrega una actividad al viaje en curso. Con `placeId`, toma nombre, ubicación y duración del lugar. */
export function addItineraryItem(db: SupabaseClient, input: AddItemInput, actor: Actor): Promise<Result<ItineraryItem>> {
  return guarded("add", async () => {
    const parsed = addSchema.safeParse(input)
    if (!parsed.success) return fail("Actividad inválida.")
    const v = parsed.data

    const tripId = await activeTripId(db)
    if (!tripId) return fail("No hay un viaje en curso.")

    let place: { name: string; lat: number; lng: number; typical_visit_minutes: number } | null = null
    if (v.placeId) {
      const { data, error } = await db
        .from("places")
        .select("name, lat, lng, typical_visit_minutes")
        .eq("id", v.placeId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return fail("No conozco ese lugar.")
      place = data
    }

    const endsAt =
      v.endsAt ??
      (place ? new Date(new Date(v.startsAt).getTime() + place.typical_visit_minutes * 60_000).toISOString() : null)
    if (!endsAfterStart(v.startsAt, endsAt)) return fail("La actividad tiene que terminar después de empezar.")

    await snapshot(db, tripId)
    const { data, error } = await db
      .from("itinerary_items")
      .insert({
        trip_id: tripId,
        title: v.title ?? place!.name,
        notes: v.notes,
        starts_at: v.startsAt,
        ends_at: endsAt,
        place_id: v.placeId,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        source: v.source ?? (actor === "agent" ? "agent" : "user") satisfies ItinerarySource,
        source_ref: v.sourceRef,
        locked: v.locked ?? false,
      })
      .select(ITINERARY_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    return ok(data as ItineraryItem)
  })
}

/** Edita o mueve una actividad (cambiar el horario es "mover"). */
export function updateItineraryItem(
  db: SupabaseClient,
  id: string,
  input: UpdateItemInput,
  actor: Actor
): Promise<Result<ItineraryItem>> {
  return guarded("update", async () => {
    const parsed = updateSchema.safeParse(input)
    if (!parsed.success) return fail("Cambio inválido.")
    const v = parsed.data

    const item = await getItem(db, id)
    if (!item) return fail("No encontré esa actividad.")
    if (item.locked && actor === "agent") return fail(LOCKED_ERROR)
    if (actor === "agent" && v.locked !== undefined) return fail("Las reservas solo se marcan desde la app.")

    const startsAt = v.startsAt ?? item.starts_at
    // Si se mueve el comienzo sin decir el final, se conserva la duración.
    const endsAt =
      v.endsAt !== undefined
        ? v.endsAt
        : v.startsAt && item.ends_at
          ? new Date(
              new Date(v.startsAt).getTime() + (new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime())
            ).toISOString()
          : item.ends_at
    if (!endsAfterStart(startsAt, endsAt)) return fail("La actividad tiene que terminar después de empezar.")

    await snapshot(db, item.trip_id)
    const { data, error } = await db
      .from("itinerary_items")
      .update({
        ...(v.title !== undefined && { title: v.title }),
        ...(v.notes !== undefined && { notes: v.notes }),
        ...(v.locked !== undefined && { locked: v.locked }),
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .eq("id", id)
      .select(ITINERARY_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    return ok(data as ItineraryItem)
  })
}

const statusSchema = z.enum(["planned", "in_progress", "done", "skipped"])

/** Marca una actividad como pendiente, en curso, hecha o saltada. */
export function setItineraryStatus(db: SupabaseClient, id: string, status: ItineraryItem["status"]): Promise<Result<ItineraryItem>> {
  return guarded("status", async () => {
    if (!statusSchema.safeParse(status).success) return fail("Estado inválido.")
    const item = await getItem(db, id)
    if (!item) return fail("No encontré esa actividad.")
    if (item.status === status) return ok(item)

    await snapshot(db, item.trip_id)
    const { data, error } = await db
      .from("itinerary_items")
      .update({ status })
      .eq("id", id)
      .select(ITINERARY_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    return ok(data as ItineraryItem)
  })
}

/** Borra una actividad. */
export function removeItineraryItem(db: SupabaseClient, id: string, actor: Actor): Promise<Result<{ id: string }>> {
  return guarded("remove", async () => {
    const item = await getItem(db, id)
    if (!item) return fail("No encontré esa actividad.")
    if (item.locked && actor === "agent") return fail(LOCKED_ERROR)

    await snapshot(db, item.trip_id)
    const { error } = await db.from("itinerary_items").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return ok({ id })
  })
}

/** Vuelve el itinerario del viaje en curso a como estaba antes del último cambio. */
async function lastChangedBy(db: SupabaseClient, tripId: string): Promise<string> {
  const { data: userId } = await db.rpc("last_itinerary_change_by", { p_trip_id: tripId })
  if (!userId) return "otra persona"
  const { data } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle()
  return (data?.full_name as string | undefined)?.split(" ")[0] ?? "otra persona"
}

export function undoItinerary(db: SupabaseClient): Promise<Result<{ items: number }>> {
  return guarded("undo", async () => {
    const tripId = await activeTripId(db)
    if (!tripId) return fail("No hay un viaje en curso.")

    const { data, error } = await db.rpc("restore_itinerary_snapshot", { p_trip_id: tripId })
    if (error) throw new Error(error.message)
    if (data === null) return fail("No hay nada para deshacer.")
    // Viaje compartido: lo último lo cambió otro, y deshacer le borraría su cambio.
    if (data === -1) return fail(`Lo último lo cambió ${await lastChangedBy(db, tripId)}: deshacelo a mano.`)
    return ok({ items: data as number })
  })
}
