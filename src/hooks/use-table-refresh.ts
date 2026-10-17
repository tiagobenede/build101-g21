"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { createClient } from "@/lib/supabase/client"

const DEBOUNCE_MS = 300

/**
 * Refresca la pantalla cuando cambia una tabla (Supabase Realtime). RLS se aplica
 * con la sesión del usuario: solo llegan los cambios de sus propias filas.
 */
export function useTableRefresh(table: string) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    // Realtime aplica RLS con el token del usuario: hay que pasárselo antes de suscribirse,
    // si no el canal entra como anónimo y no llega ningún cambio.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      channel = supabase
        .channel(`refresh:${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => router.refresh(), DEBOUNCE_MS)
        })
        .subscribe()
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [router, table])
}
