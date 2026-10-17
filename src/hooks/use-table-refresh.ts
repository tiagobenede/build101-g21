"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { onTableChange } from "@/lib/supabase/client"

const DEBOUNCE_MS = 300

/**
 * Refresca la pantalla cuando cambia una tabla (Supabase Realtime). RLS se aplica
 * con la sesión del usuario: solo llegan los cambios de sus propias filas.
 */
export function useTableRefresh(table: string) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    void onTableChange(table, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS)
    }).then((stop) => {
      // Si el componente se desmontó mientras nos suscribíamos, soltamos el canal ya.
      if (cancelled) stop()
      else unsubscribe = stop
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      unsubscribe?.()
    }
  }, [router, table])
}
