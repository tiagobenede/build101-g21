"use client"

import { subscribePush, unsubscribePush } from "@/app/notifications/actions"

import { vapidKeyToBytes } from "./queue"

/**
 * Notificaciones push del lado del navegador: registrar el service worker
 * (`public/sw.js`), pedir permiso y guardar la suscripción en el server.
 */

export type PushState = "unsupported" | "denied" | "off" | "on"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(VAPID_PUBLIC_KEY)

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return navigator.serviceWorker.register("/sw.js", { scope: "/" })
}

async function save(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const result = await subscribePush({
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    userAgent: navigator.userAgent,
  })
  if (!result.ok) throw new Error(result.error)
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  const reg = await navigator.serviceWorker.getRegistration("/")
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === "granted" ? "on" : "off"
}

/**
 * Pide permiso y suscribe este navegador. Tiene que llamarse desde un clic: los
 * navegadores no dejan pedir permiso de notificaciones sin un gesto del usuario.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported"
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "denied" : "off"

  const reg = (await registerServiceWorker())!
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(VAPID_PUBLIC_KEY!) }))
  await save(sub)
  return "on"
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/")
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await unsubscribePush(sub.endpoint)
    await sub.unsubscribe()
  }
  return "off"
}

/**
 * Si ya estaba activado, vuelve a guardar la suscripción (por si la base se reseteó o es
 * otro usuario en el mismo navegador). No pide permiso.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return
  const reg = await registerServiceWorker()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await save(sub)
}
