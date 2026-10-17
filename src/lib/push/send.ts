import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import webpush, { WebPushError } from "web-push"

/**
 * Manda una notificación push a todos los navegadores donde el viajero activó los avisos.
 * Lo usa el motor de cercanía (C-6) cuando crea un aviso. El service worker
 * (`public/sw.js`) la muestra, salvo que Polo esté abierto y a la vista.
 */

export type PushPayload = {
  title: string
  body: string
  /** Qué abre al tocarla. */
  url: string
  /** Notificaciones con el mismo tag se reemplazan en vez de apilarse. */
  tag?: string
}

let configured: boolean | null = null

/** Las claves VAPID se configuran una vez. Sin claves, no se manda nada (y se avisa una vez). */
function configure(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  configured = Boolean(publicKey && privateKey && subject)
  if (configured) webpush.setVapidDetails(subject!, publicKey!, privateKey!)
  else console.warn("[push] Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT: no se mandan notificaciones push.")
  return configured
}

/** El servicio de push dice que la suscripción ya no existe (el viajero la revocó o expiró). */
const isGone = (err: unknown) => err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)

/** Devuelve cuántas se mandaron. Las suscripciones que ya no existen se borran. */
export async function sendPushToUser(db: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0

  const { data: subs, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId)
  if (error) throw new Error(`No se pudieron leer las suscripciones: ${error.message}`)

  const body = JSON.stringify(payload)
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          body,
          { TTL: 10 * 60, urgency: "high", topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined }
        )
        return true
      } catch (err) {
        if (isGone(err)) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint)
        else console.error("[push] send failed", err instanceof Error ? err.message : err)
        return false
      }
    })
  )
  return results.filter(Boolean).length
}
