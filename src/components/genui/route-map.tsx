"use client"

import { useEffect, useRef } from "react"

import { categoryColor } from "@/components/rumbo/category-icon"
import type { LatLng } from "@/lib/geo"
import { dotElement, loadGoogleMaps, MAP_ID } from "@/lib/maps/google-maps"

interface RouteMapViewProps {
  from: LatLng
  to: LatLng
  category: string
  /** La caminata por calles. Null: línea recta (mientras carga o si no hay ruta). */
  path: LatLng[] | null
}

/** El mapa es bajo (176 px): poco margen arriba y abajo para que la caminata no quede chiquita. */
const BOUNDS_PADDING_PX = { top: 20, bottom: 20, left: 36, right: 36 }

/**
 * Mapa chico (Google) con la caminata desde donde estás hasta el lugar: por calles si hay
 * ruta, si no en línea recta.
 * Se crea y se destruye en un solo efecto (ver MapView).
 */
export default function RouteMapView({
  from: { lat: fromLat, lng: fromLng },
  to: { lat: toLat, lng: toLng },
  category,
  path,
}: RouteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const from = { lat: fromLat, lng: fromLng }
    const to = { lat: toLat, lng: toLng }
    let cancelled = false
    let cleanup = () => {}
    // La ruta de Google termina en la calle más cercana: la unimos a los dos puntos.
    const walk = path ? [from, ...path, to] : [from, to]

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
          // Sin redondear el zoom al encuadrar: con zoom entero, una caminata de 1 km quedaba a la mitad.
          isFractionalZoomEnabled: true,
        })
        const line = new google.maps.Polyline({
          map,
          path: walk,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2.5, fillColor: "#0071E3", fillOpacity: 1, strokeOpacity: 0 },
              offset: "0",
              repeat: path ? "8px" : "10px",
            },
          ],
        })
        const start = new marker.AdvancedMarkerElement({ map, position: from, content: dotElement("#0071E3", 18) })
        const end = new marker.AdvancedMarkerElement({ map, position: to, content: dotElement(categoryColor(category), 22) })
        const bounds = new google.maps.LatLngBounds()
        for (const point of walk) bounds.extend(point)
        map.fitBounds(bounds, BOUNDS_PADDING_PX)
        // La tarjeta entra animada: si el mapa cambia de tamaño, se vuelve a encuadrar la caminata.
        const resize = new ResizeObserver(() => map.fitBounds(bounds, BOUNDS_PADDING_PX))
        resize.observe(el)
        cleanup = () => {
          resize.disconnect()
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
  }, [fromLat, fromLng, toLat, toLng, category, path])

  return <div ref={containerRef} className="size-full" />
}
