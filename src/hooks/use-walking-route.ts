"use client"

import { useEffect, useState } from "react"

import type { LatLng } from "@/lib/geo"
import type { WalkingRoute } from "@/lib/maps/walking-route"

export type WalkingRouteState = {
  /** La última ruta que llegó. Mientras se pide una nueva (te moviste) queda la anterior. */
  route: WalkingRoute | null
  /** Google no dio ruta: el mapa dibuja la línea recta y los minutos son la estimación. */
  failed: boolean
}

/** Pide la ruta a pie (por calles) desde `from` hasta `to`; de nuevo cada vez que cambian. */
export function useWalkingRoute({ lat: fromLat, lng: fromLng }: LatLng, { lat: toLat, lng: toLng }: LatLng): WalkingRouteState {
  const [state, setState] = useState<WalkingRouteState & { to: string }>({ route: null, failed: false, to: "" })
  const to = `${toLat},${toLng}`

  useEffect(() => {
    const abort = new AbortController()
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: { lat: fromLat, lng: fromLng }, to: { lat: toLat, lng: toLng } }),
      signal: abort.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ route: WalkingRoute | null }>) : { route: null }))
      .then(({ route }) =>
        // Si falla un re-pedido, sigue la ruta que ya había.
        setState((s) => (route ? { route, failed: false, to } : s.to === to && s.route ? s : { route: null, failed: true, to }))
      )
      .catch(() => {
        if (!abort.signal.aborted) setState((s) => (s.to === to && s.route ? s : { route: null, failed: true, to }))
      })
    return () => abort.abort()
  }, [to, fromLat, fromLng, toLat, toLng])

  // Una ruta de otro destino no sirve.
  return state.to === to ? state : { route: null, failed: false }
}
