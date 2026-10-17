"use client"

import { useEffect, useRef, useState } from "react"

import { categoryColor } from "@/components/rumbo/category-icon"
import type { LatLng } from "@/lib/geo"
import { dotElement, loadGoogleMaps, MAP_ID } from "@/lib/maps/google-maps"
import { remainingWalk } from "@/lib/maps/walk-progress"

interface RouteMapViewProps {
  /** Donde estás ahora (se mueve mientras caminás). */
  from: LatLng
  to: LatLng
  category: string
  /** La caminata por calles. Null: línea recta (mientras carga o si no hay ruta). */
  path: LatLng[] | null
  /** Pantalla completa: se puede mover y hacer zoom. */
  interactive?: boolean
}

/** En la tarjeta el mapa es bajo (176 px): poco margen arriba y abajo para que la caminata no quede chiquita. */
const CARD_PADDING_PX = { top: 20, bottom: 20, left: 36, right: 36 }
/** En pantalla completa: lugar para el botón de cerrar arriba y el panel de abajo. */
const FULL_PADDING_PX = { top: 96, bottom: 180, left: 48, right: 48 }

type MapParts = { map: google.maps.Map; line: google.maps.Polyline; moveStart: (position: LatLng) => void }

/**
 * Mapa chico (Google) con la caminata desde donde estás hasta el lugar: por calles si hay
 * ruta, si no en línea recta. El mapa se crea una vez por destino; mientras caminás se
 * mueven tu punto y la línea, y al llegar una ruta nueva se vuelve a encuadrar.
 */
export default function RouteMapView({ from, to: { lat: toLat, lng: toLng }, category, path, interactive = false }: RouteMapViewProps) {
  const padding = interactive ? FULL_PADDING_PX : CARD_PADDING_PX
  const containerRef = useRef<HTMLDivElement>(null)
  const [parts, setParts] = useState<MapParts | null>(null)
  // El primer encuadre usa la posición del momento; después la sigue el otro efecto.
  const fromRef = useRef(from)
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null)

  useEffect(() => {
    fromRef.current = from
  }, [from])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const to = { lat: toLat, lng: toLng }
    let cancelled = false
    let cleanup = () => {}

    loadGoogleMaps()
      .then(({ maps, marker }) => {
        if (cancelled) return
        const map = new maps.Map(el, {
          mapId: MAP_ID,
          center: fromRef.current,
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: interactive ? "greedy" : "none",
          keyboardShortcuts: interactive,
          clickableIcons: false,
          // Sin redondear el zoom al encuadrar: con zoom entero, una caminata de 1 km quedaba a la mitad.
          isFractionalZoomEnabled: true,
        })
        const line = new google.maps.Polyline({
          map,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2.5, fillColor: "#0071E3", fillOpacity: 1, strokeOpacity: 0 },
              offset: "0",
              repeat: "8px",
            },
          ],
        })
        const start = new marker.AdvancedMarkerElement({ map, position: fromRef.current, content: dotElement("#0071E3", 18) })
        const end = new marker.AdvancedMarkerElement({ map, position: to, content: dotElement(categoryColor(category), 22) })
        // La tarjeta entra animada: si el mapa cambia de tamaño, se vuelve a encuadrar la caminata.
        const resize = new ResizeObserver(() => {
          if (boundsRef.current) map.fitBounds(boundsRef.current, padding)
        })
        resize.observe(el)
        setParts({
          map,
          line,
          moveStart: (position) => {
            start.position = position
          },
        })
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
      setParts(null)
      boundsRef.current = null
      el.replaceChildren()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interactive y padding no cambian en la vida del mapa
  }, [toLat, toLng, category])

  // Ruta nueva (o la primera): encuadrar toda la caminata que falta.
  useEffect(() => {
    if (!parts) return
    const bounds = new google.maps.LatLngBounds()
    for (const point of remainingWalk(fromRef.current, path, { lat: toLat, lng: toLng })) bounds.extend(point)
    boundsRef.current = bounds
    parts.map.fitBounds(bounds, padding)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- padding no cambia en la vida del mapa
  }, [parts, path, toLat, toLng])

  // Mientras caminás: tu punto y lo que falta de la línea, sin mover el encuadre.
  const { lat: fromLat, lng: fromLng } = from
  useEffect(() => {
    if (!parts) return
    const here = { lat: fromLat, lng: fromLng }
    parts.moveStart(here)
    parts.line.setPath(remainingWalk(here, path, { lat: toLat, lng: toLng }))
  }, [parts, path, fromLat, fromLng, toLat, toLng])

  return <div ref={containerRef} className="size-full" />
}
