"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { onTableChange } from "@/lib/supabase/client"

/**
 * Viaje compartido: avisa cuando otra persona del viaje suma o mueve algo del plan
 * ("Sofía sumó Marché des Enfants Rouges"). Los cambios propios no avisan.
 */
export function useCompanionActivity(companionNames: Record<string, string>) {
  const namesRef = useRef(companionNames)
  useEffect(() => {
    namesRef.current = companionNames
  }, [companionNames])
  const hasCompanions = Object.keys(companionNames).length > 0

  useEffect(() => {
    if (!hasCompanions) return
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    void onTableChange("itinerary_items", (change) => {
      const row = change.new as { title?: string; created_by?: string | null; updated_by?: string | null; starts_at?: string }
      const old = change.old as { starts_at?: string }
      if (change.eventType === "INSERT" && row.created_by) {
        const name = namesRef.current[row.created_by]
        if (name) toast(`${name} sumó ${row.title ?? "algo"} al plan`)
      } else if (change.eventType === "UPDATE" && row.updated_by && old.starts_at !== row.starts_at) {
        const name = namesRef.current[row.updated_by]
        if (name) toast(`${name} cambió la hora de ${row.title ?? "una actividad"}`)
      }
    }).then((stop) => {
      if (cancelled) stop()
      else unsubscribe = stop
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [hasCompanions])
}
