"use client"

import { useEffect, useState } from "react"

import type { LatLng } from "@/lib/geo"
import type { WalkingRoute } from "@/lib/maps/walking-route"

export type WalkingRouteState =
  | { status: "loading" }
  | { status: "ready"; route: WalkingRoute }
  /** Sin ruta de Google: el mapa dibuja la línea recta y los minutos son la estimación. */
  | { status: "failed" }

/** Pide la ruta a pie (por calles) desde `from` hasta `to`. */
export function useWalkingRoute({ lat: fromLat, lng: fromLng }: LatLng, { lat: toLat, lng: toLng }: LatLng): WalkingRouteState {
  const key = `${fromLat},${fromLng}|${toLat},${toLng}`
  const [result, setResult] = useState<{ key: string; state: WalkingRouteState } | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: { lat: fromLat, lng: fromLng }, to: { lat: toLat, lng: toLng } }),
      signal: abort.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ route: WalkingRoute | null }>) : { route: null }))
      .then(({ route }) => setResult({ key, state: route ? { status: "ready", route } : { status: "failed" } }))
      .catch(() => {
        if (!abort.signal.aborted) setResult({ key, state: { status: "failed" } })
      })
    return () => abort.abort()
  }, [key, fromLat, fromLng, toLat, toLng])

  return result?.key === key ? result.state : { status: "loading" }
}
