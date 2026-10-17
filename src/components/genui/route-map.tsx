"use client"

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { useEffect, useRef } from "react"

import { categoryColor } from "@/components/rumbo/category-icon"
import type { LatLng } from "@/lib/geo"

const TILES_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const dot = (color: string, size: number) =>
  L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
  })

interface RouteMapViewProps {
  from: LatLng
  to: LatLng
  category: string
}

/**
 * Mapa chico con la caminata en línea recta desde donde estás hasta el lugar.
 * Leaflet directo: se crea y se destruye en un solo efecto (ver MapView).
 */
export default function RouteMapView({ from, to, category }: RouteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
    })
    L.tileLayer(TILES_URL, { attribution: ATTRIBUTION, className: "rumbo-tiles" }).addTo(map)
    L.polyline(
      [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      { color: "#0071E3", weight: 5, opacity: 0.9, dashArray: "1 10", lineCap: "round" }
    ).addTo(map)
    L.marker([from.lat, from.lng], { icon: dot("#0071E3", 18), interactive: false }).addTo(map)
    L.marker([to.lat, to.lng], { icon: dot(categoryColor(category), 22), interactive: false }).addTo(map)
    map.fitBounds(L.latLngBounds([from.lat, from.lng], [to.lat, to.lng]).pad(0.35))
    return () => {
      map.remove()
    }
  }, [from.lat, from.lng, to.lat, to.lng, category])

  return <div ref={containerRef} className="size-full" />
}
