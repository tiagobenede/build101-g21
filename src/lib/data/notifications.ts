import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { fail, ok, type Result } from "@/lib/data/result"

/**
 * Avisos por cercanía del lado del viajero: suscribirse a las notificaciones push del
 * navegador y marcar avisos como vistos. Mismo patrón que `itinerary.ts`: cliente del
 * usuario (RLS) y `Result` con el error en español.
 */

const subscriptionSchema = z.object({
  endpoint: z.url().max(2_000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
  userAgent: z.string().max(500).nullable(),
})

export type PushSubscriptionInput = z.input<typeof subscriptionSchema>

async function userId(db: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await db.auth.getUser()
  return user?.id ?? null
}

/** Guarda (o actualiza) la suscripción push de este navegador. */
export async function savePushSubscription(db: SupabaseClient, input: PushSubscriptionInput): Promise<Result<null>> {
  const parsed = subscriptionSchema.safeParse(input)
  if (!parsed.success) return fail("Suscripción inválida.")
  const uid = await userId(db)
  if (!uid) return fail("Sin sesión.")

  const { endpoint, keys, userAgent } = parsed.data
  const { error } = await db
    .from("push_subscriptions")
    .upsert({ user_id: uid, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent }, { onConflict: "endpoint" })
  if (error) {
    console.error("[push] save subscription", error.message)
    return fail("No pude activar los avisos.")
  }
  return ok(null)
}

/** Borra la suscripción de este navegador (desactivar avisos). */
export async function deletePushSubscription(db: SupabaseClient, endpoint: string): Promise<Result<null>> {
  if (!z.url().safeParse(endpoint).success) return fail("Suscripción inválida.")
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint)
  if (error) {
    console.error("[push] delete subscription", error.message)
    return fail("No pude desactivar los avisos.")
  }
  return ok(null)
}

/** Marca un aviso como visto (tocado o descartado). */
export async function markNotificationSeen(db: SupabaseClient, id: string): Promise<Result<null>> {
  if (!z.uuid().safeParse(id).success) return fail("Aviso inválido.")
  const { error } = await db.from("notifications").update({ seen_at: new Date().toISOString() }).eq("id", id).is("seen_at", null)
  if (error) {
    console.error("[notifications] mark seen", error.message)
    return fail("No pude marcar el aviso.")
  }
  return ok(null)
}
