"use client"

import { useEffect, useRef } from "react"

import { categoryColor } from "@/components/rumbo/category-icon"
import type { LatLng } from "@/lib/geo"
import { dotElement, loadGoogleMaps, MAP_ID } from "@/lib/maps/google-maps"

interface RouteMapViewProps {
  from: LatLng
  to: LatLng
  category: string
}

const BOUNDS_PADDING_PX = 36

/**
 * Mapa chico (Google) con la caminata en línea recta desde donde estás hasta el lugar.
 * Se crea y se destruye en un solo efecto (ver MapView).
 */
export default function RouteMapView({ from: { lat: fromLat, lng: fromLng }, to: { lat: toLat, lng: toLng }, category }: RouteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const from = { lat: fromLat, lng: fromLng }
    const to = { lat: toLat, lng: toLng }
    let cancelled = false
    let cleanup = () => {}

    loadGoogleMaps()
      .then(({ maps, marker }) => {
        if (cancelled) return
        const map = new maps.Map(el, {
          mapId: MAP_ID,
          center: from,
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
        })
        const line = new google.maps.Polyline({
          map,
          path: [from, to],
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2.5, fillColor: "#0071E3", fillOpacity: 1, strokeOpacity: 0 },
              offset: "0",
              repeat: "10px",
            },
          ],
        })
        const start = new marker.AdvancedMarkerElement({ map, position: from, content: dotElement("#0071E3", 18) })
        const end = new marker.AdvancedMarkerElement({ map, position: to, content: dotElement(categoryColor(category), 22) })
        const bounds = new google.maps.LatLngBounds()
        bounds.extend(from)
        bounds.extend(to)
        map.fitBounds(bounds, BOUNDS_PADDING_PX)
        cleanup = () => {
          line.setMap(null)
          start.map = null
          end.map = null
        }
      })
      .catch((err: unknown) => console.error("[route-map]", err instanceof Error ? err.message : err))

    return () => {
      cancelled = true
      cleanup()
      el.replaceChildren()
    }
  }, [fromLat, fromLng, toLat, toLng, category])

  return <div ref={containerRef} className="size-full" />
}
