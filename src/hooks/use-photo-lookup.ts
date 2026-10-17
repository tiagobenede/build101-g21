"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import type { PlaceCard } from "@/hooks/voice-session-types"
import type { LatLng } from "@/lib/geo"

type SeenKind = "lugar" | "obra" | "otro"
type VisionData = {
  via: "jev" | "llm"
  name: string | null
  kind: SeenKind | null
  where: string | null
  description: string | null
  place: PlaceCard | null
}
type ApiResponse<T> = { success: true; data: T } | { success: false; error: string }

export type PhotoMatch = {
  /** Qué es, según la visión: un lugar, una obra o una cosa. */
  name: string
  kind: SeenKind
  /** Para una obra o una cosa: dónde está (el museo). */
  where: string | null
  description: string | null
  /** El lugar de `places` (para la pantalla y "Al plan"), si se pudo ubicar. */
  place: PlaceCard | null
}

async function postJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null
  if (!body?.success) throw new Error(body && !body.success ? body.error : "No pude reconocer la foto.")
  return body.data
}

/**
 * "¿Qué estoy viendo?": foto → `/api/vision` (C-3) → lugar. Si la visión solo da el
 * nombre de un lugar (respaldo con LLM), se busca ese nombre para tener el lugar en pantalla.
 */
export function usePhotoLookup(getLocation: () => LatLng | null, onMatch: (match: PhotoMatch) => void) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const look = useCallback(
    async (photo: Blob) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      const toastId = toast.loading("Mirando la foto…")
      const location = getLocation()
      try {
        const form = new FormData()
        form.append("photo", photo, "photo.jpg")
        if (location) {
          form.append("lat", String(location.lat))
          form.append("lng", String(location.lng))
        }
        const seen = await postJson<VisionData>("/api/vision", { method: "POST", body: form })
        if (!seen.name) {
          toast.error("No reconocí qué es. Probá con otra foto, más de frente.", { id: toastId })
          return
        }

        const kind = seen.kind ?? "lugar"
        let place = seen.place
        // Solo un lugar se busca en el mapa: "La Gioconda" no es una dirección.
        if (!place && kind === "lugar" && location) {
          place = await postJson<{ place: PlaceCard | null }>("/api/places/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: seen.name, location }),
          })
            .then((d) => d.place)
            .catch(() => null)
        }
        toast.dismiss(toastId)
        onMatch({ name: place?.name ?? seen.name, kind, where: seen.where, description: seen.description ?? place?.description ?? null, place })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pude reconocer la foto.", { id: toastId })
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [getLocation, onMatch]
  )

  return { look, busy }
}
