"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { markSeen } from "@/app/notifications/actions"
import { syncPushSubscription } from "@/lib/push/browser"
import { playChime } from "@/lib/push/chime"
import { BANNER_MS, enqueue, RECENT_UNSEEN_MS, type ShownNotification } from "@/lib/push/queue"
import { createClient, onTableChange } from "@/lib/supabase/client"

import { ProximityBanner } from "./proximity-banner"

type NotificationRow = { id: string; place_id: string; reason_text: string; created_at: string }
type PlaceRow = { name: string; category: string } | null

async function toShown(row: NotificationRow, place?: PlaceRow): Promise<ShownNotification> {
  const p =
    place !== undefined
      ? place
      : ((await createClient().from("places").select("name, category").eq("id", row.place_id).maybeSingle()).data as PlaceRow)
  return {
    id: row.id,
    placeId: row.place_id,
    placeName: p?.name ?? null,
    category: p?.category ?? null,
    reason: row.reason_text,
    createdAt: new Date(row.created_at).getTime(),
  }
}

/**
 * Avisos por cercanía (C-6) en la página, en todas las pantallas: escucha las altas en
 * `notifications` por Realtime y las muestra de a una, con sonido. Tocar el aviso abre
 * /talk. Con la pestaña oculta y el push activado no muestra nada: ahí avisa el sistema
 * (`public/sw.js`). También mantiene registrada la suscripción push de este navegador.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [queue, setQueue] = useState<ShownNotification[]>([])
  const chimedRef = useRef(new Set<string>())
  const current = queue[0] ?? null

  useEffect(() => {
    const supabase = createClient()
    let unsubscribe: (() => void) | null = null
    let active = true

    const start = async () => {
      unsubscribe?.()
      unsubscribe = null
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session || !active) return

      void syncPushSubscription().catch((err: unknown) => console.warn("[push] sync", err))

      // Lo último sin ver de hace un rato (por si llegó mientras recargabas).
      const { data } = await supabase
        .from("notifications")
        .select("id, place_id, reason_text, created_at, places(name, category)")
        .is("seen_at", null)
        .gte("created_at", new Date(Date.now() - RECENT_UNSEEN_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
      for (const row of data ?? []) {
        const place = row.places as PlaceRow | PlaceRow[]
        const shown = await toShown(row as NotificationRow, Array.isArray(place) ? (place[0] ?? null) : place)
        if (active) setQueue((q) => enqueue(q, shown))
      }

      const stop = await onTableChange("notifications", (change) => {
        if (change.eventType !== "INSERT") return
        // Pestaña oculta con push activado: avisa el sistema operativo, no la página.
        if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") return
        void toShown(change.new as NotificationRow).then((shown) => setQueue((q) => enqueue(q, shown)))
      })
      if (active) unsubscribe = stop
      else stop()
    }

    void start()
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void start()
    })
    return () => {
      active = false
      unsubscribe?.()
      auth.subscription.unsubscribe()
    }
  }, [])

  const close = useCallback((id: string) => {
    setQueue((q) => q.filter((n) => n.id !== id))
    void markSeen(id)
  }, [])

  // Al aparecer: sonido una vez y se va solo si nadie lo toca.
  useEffect(() => {
    if (!current) return
    if (!chimedRef.current.has(current.id)) {
      chimedRef.current.add(current.id)
      playChime()
    }
    const timer = setTimeout(() => close(current.id), BANNER_MS)
    return () => clearTimeout(timer)
  }, [current, close])

  return (
    <>
      {children}
      {current && (
        <ProximityBanner
          key={current.id}
          notification={current}
          onDismiss={() => close(current.id)}
          onOpen={() => {
            close(current.id)
            router.push("/talk")
          }}
        />
      )}
    </>
  )
}
