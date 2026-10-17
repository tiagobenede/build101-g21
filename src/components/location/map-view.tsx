"use client"

import { useEffect, useRef, useState } from "react"

import { categoryColor } from "@/components/rumbo/category-icon"
import type { LatLng } from "@/lib/geo"
import { dotElement, loadGoogleMaps, MAP_ID } from "@/lib/maps/google-maps"

export type MapPlace = { id: string; name: string; category: string; lat: number; lng: number; forYou: boolean }
export type MapStop = { id: string; title: string; time: string; lat: number; lng: number }

interface MapViewProps {
  position: LatLng
  heading: number | null
  places: MapPlace[]
  stops: MapStop[]
  follow: boolean
  onTeleport: (position: LatLng) => void
  onUserPan: () => void
}

const INITIAL_ZOOM = 15

function userElement(heading: number | null): HTMLElement {
  const wrap = document.createElement("div")
  Object.assign(wrap.style, { position: "relative", width: "22px", height: "22px", transform: "translateY(50%)" })
  if (heading !== null) {
    const cone = document.createElement("div")
    Object.assign(cone.style, { position: "absolute", inset: "-14px", transform: `rotate(${heading}deg)` })
    const tip = document.createElement("div")
    Object.assign(tip.style, {
      margin: "0 auto",
      width: "0",
      height: "0",
      borderLeft: "10px solid transparent",
      borderRight: "10px solid transparent",
      borderBottom: "16px solid rgba(0,113,227,.35)",
    })
    cone.append(tip)
    wrap.append(cone)
  }
  const dot = dotElement("#0071E3", 22)
  Object.assign(dot.style, { position: "absolute", inset: "0", transform: "none", boxShadow: "0 1px 6px rgba(0,0,0,.3)" })
  wrap.append(dot)
  return wrap
}

/** Etiqueta naranja con la hora (texto plano: nunca HTML). */
function stopElement(stop: MapStop): HTMLElement {
  const el = document.createElement("div")
  el.textContent = stop.time
  Object.assign(el.style, {
    padding: "2px 6px",
    borderRadius: "8px",
    background: "#FF9500",
    color: "#fff",
    font: "600 11px -apple-system, system-ui",
    border: "2px solid #fff",
    boxShadow: "0 1px 3px rgba(0,0,0,.25)",
    transform: "translateY(50%)",
  })
  return el
}

type Overlay = google.maps.marker.AdvancedMarkerElement

function drawOverlays(
  { marker }: Pick<Awaited<ReturnType<typeof loadGoogleMaps>>, "marker">,
  map: google.maps.Map,
  places: MapPlace[],
  stops: MapStop[]
): Overlay[] {
  return [
    ...places.map(
      (p) =>
        new marker.AdvancedMarkerElement({
          map,
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          content: dotElement(categoryColor(p.category), p.forYou ? 16 : 11, p.forYou ? 1 : 0.8),
        })
    ),
    ...stops.map(
      (s) =>
        new marker.AdvancedMarkerElement({
          map,
          position: { lat: s.lat, lng: s.lng },
          title: s.title,
          content: stopElement(s),
          zIndex: 500,
        })
    ),
  ]
}

/** Saca los marcadores del mapa. */
function removeMarkers(markers: Overlay[]) {
  for (const m of markers) m.map = null
}

const toLatLng = (p: google.maps.LatLng | google.maps.LatLngLiteral | google.maps.LatLngAltitudeLiteral | null | undefined) =>
  p ? (typeof p.lat === "function" ? { lat: (p as google.maps.LatLng).lat(), lng: (p as google.maps.LatLng).lng() } : (p as LatLng)) : null

type MapState = {
  libs: Awaited<ReturnType<typeof loadGoogleMaps>>
  map: google.maps.Map
  user: Overlay
  overlays: Overlay[]
}

/**
 * Mapa de Google con la ubicación (simulada o real), los lugares cercanos y el itinerario.
 * Se crea y se destruye en un solo efecto: Next 16 "duerme" las pantallas que dejaste y al
 * volver re-ejecuta los efectos sin remontar.
 */
export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<MapState | null>(null)
  const latest = useRef(props)
  const [ready, setReady] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false
    const listeners: google.maps.MapsEventListener[] = []

    loadGoogleMaps()
      .then((libs) => {
        if (cancelled) return
        const { position, heading, places, stops } = latest.current
        const map = new libs.maps.Map(el, {
          mapId: MAP_ID,
          center: position,
          zoom: INITIAL_ZOOM,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: true,
        })
        const user = new libs.marker.AdvancedMarkerElement({
          map,
          position,
          content: userElement(heading),
          gmpDraggable: true,
          zIndex: 1000,
          title: "Vos",
        })
        listeners.push(
          user.addListener("dragend", () => {
            const at = toLatLng(user.position)
            if (at) latest.current.onTeleport(at)
          }),
          map.addListener("click", (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
            // Tocar un lugar de Google también te lleva ahí (sin abrir su ficha).
            if ("placeId" in e && e.placeId) e.stop()
            const at = toLatLng(e.latLng)
            if (at) latest.current.onTeleport(at)
          }),
          map.addListener("dragstart", () => latest.current.onUserPan())
        )
        stateRef.current = { libs, map, user, overlays: drawOverlays(libs, map, places, stops) }
        setReady((n) => n + 1)
      })
      .catch((err: unknown) => {
        console.error("[map]", err instanceof Error ? err.message : err)
        if (!cancelled) setError("No se pudo cargar el mapa.")
      })

    return () => {
      cancelled = true
      for (const l of listeners) l.remove()
      const state = stateRef.current
      if (state) {
        removeMarkers([...state.overlays, state.user])
      }
      stateRef.current = null
      el.replaceChildren()
    }
  }, [])

  const { position, heading, places, stops, follow } = props

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    removeMarkers(state.overlays)
    stateRef.current = { ...state, overlays: drawOverlays(state.libs, state.map, places, stops) }
  }, [places, stops, ready])

  useEffect(() => {
    if (stateRef.current) stateRef.current.user.content = userElement(heading)
  }, [heading, ready])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    state.user.position = position
    if (follow) state.map.setCenter(position)
  }, [position, follow, ready])

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
      {error && <p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">{error}</p>}
    </div>
  )
}
