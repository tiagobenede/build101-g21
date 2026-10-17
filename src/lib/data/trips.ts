import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { newInviteCode } from "@/lib/data/invite-code"
import { fail, ok, type Result } from "@/lib/data/result"

/**
 * Viaje compartido (L-1): miembros, invitaciones y el viaje en curso. La membresía
 * la decide la base (`trip_members` + funciones de la migración `shared_trips`).
 */

export type TripMember = {
  userId: string
  fullName: string
  firstName: string
  role: "owner" | "member"
  dietary: string[]
  mobility: string | null
}

/** El viaje en curso: de los que soy miembro y que incluyen hoy, el último al que me sumé. */
export async function activeTripId(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.rpc("active_trip_id")
  if (error) throw new Error(`No se pudo cargar el viaje: ${error.message}`)
  return (data as string | null) ?? null
}

/** Todos los que están en el viaje (yo incluido), el dueño primero. */
export async function getTripMembers(db: SupabaseClient, tripId: string): Promise<TripMember[]> {
  const { data, error } = await db
    .from("trip_members")
    .select("user_id, role, joined_at, profiles(full_name, dietary, mobility)")
    .eq("trip_id", tripId)
    .order("joined_at")
  if (error) throw new Error(`No se pudo cargar quiénes viajan: ${error.message}`)
  return data
    .map((m) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as {
        full_name: string
        dietary: string[] | null
        mobility: string | null
      } | null
      const fullName = p?.full_name ?? "Alguien"
      return {
        userId: m.user_id as string,
        fullName,
        firstName: fullName.split(" ")[0],
        role: m.role as TripMember["role"],
        dietary: p?.dietary ?? [],
        mobility: p?.mobility ?? null,
      }
    })
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"))
}

/** Código para que otro se sume al viaje en curso (vale 7 días). */
export async function createInvite(db: SupabaseClient): Promise<Result<{ code: string; expiresAt: string }>> {
  const tripId = await activeTripId(db)
  if (!tripId) return fail("No hay un viaje en curso.")
  // Un choque de códigos es rarísimo; si pasa, se prueba otro.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("trip_invites")
      .insert({ code: newInviteCode(), trip_id: tripId })
      .select("code, expires_at")
      .single()
    if (!error) return ok({ code: data.code as string, expiresAt: data.expires_at as string })
    if (error.code !== "23505") {
      console.error("[trips] create invite failed", error.message)
      return fail("No pude crear la invitación.")
    }
  }
  return fail("No pude crear la invitación.")
}

/** Sumarse a un viaje con un código. */
export async function joinTrip(db: SupabaseClient, code: string): Promise<Result<{ tripId: string }>> {
  const { data, error } = await db.rpc("join_trip", { p_code: code })
  if (error) {
    if (error.message.includes("invalid_invite")) return fail("Ese código no existe o ya venció.")
    console.error("[trips] join failed", error.message)
    return fail("No pude sumarte al viaje.")
  }
  return ok({ tripId: data as string })
}

/** Salir del viaje en curso (si no es propio). */
export async function leaveTrip(db: SupabaseClient): Promise<Result<null>> {
  const tripId = await activeTripId(db)
  if (!tripId) return fail("No hay un viaje en curso.")
  const { error } = await db.rpc("leave_trip", { p_trip_id: tripId })
  if (error) {
    console.error("[trips] leave failed", error.message)
    return fail("No pude sacarte del viaje.")
  }
  return ok(null)
}
