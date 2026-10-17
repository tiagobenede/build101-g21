/** Aviso por cercanía tal como lo muestra la página. */
export type ShownNotification = {
  id: string
  placeId: string
  /** Nombre y categoría del lugar (para el título y el ícono). */
  placeName: string | null
  category: string | null
  reason: string
  createdAt: number
}

/** Al abrir la app se muestra el último aviso sin ver si es de hace menos que esto. */
export const RECENT_UNSEEN_MS = 10 * 60 * 1000
/** Cuánto queda en pantalla un aviso si nadie lo toca. */
export const BANNER_MS = 8_000

/** Agrega un aviso a la cola (uno por vez en pantalla): sin duplicados, en orden de llegada. */
export function enqueue(queue: readonly ShownNotification[], n: ShownNotification): ShownNotification[] {
  if (queue.some((q) => q.id === n.id)) return [...queue]
  return [...queue, n].sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * La clave pública VAPID viene en base64url; `PushManager.subscribe` la quiere en bytes.
 */
export function vapidKeyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
