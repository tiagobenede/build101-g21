"use client"

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { useEffect, useRef } from "react"

import { categoryColor } from "@/components/rumbo/category-icon"
import type { LatLng } from "@/lib/geo"

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
// Tiles estándar de OpenStreetMap: no piden key (uso liviano, como una demo).
const TILES_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function userIcon(heading: number | null) {
  const cone =
    heading === null
      ? ""
      : `<div style="position:absolute;inset:-14px;transform:rotate(${heading}deg)"><div style="margin:0 auto;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:16px solid rgba(0,113,227,.35)"></div></div>`
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="position:relative;width:22px;height:22px">${cone}<div style="position:absolute;inset:0;border-radius:9999px;background:#0071E3;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.3)"></div></div>`,
  })
}

function placeIcon(place: MapPlace) {
  const size = place.forYou ? 16 : 11
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${categoryColor(place.category)};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25);opacity:${place.forYou ? 1 : 0.75}"></div>`,
  })
}

function stopIcon(stop: MapStop) {
  return L.divIcon({
    className: "",
    iconSize: [44, 22],
    iconAnchor: [22, 11],
    html: `<div style="padding:2px 6px;border-radius:8px;background:#FF9500;color:#fff;font:600 11px -apple-system,system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)">${stop.time}</div>`,
  })
}

/** Tooltip con texto plano (los nombres vienen de Google: nunca como HTML). */
function textTooltip(text: string): HTMLElement {
  const el = document.createElement("span")
  el.textContent = text
  return el
}

function drawOverlays(layer: L.LayerGroup, places: MapPlace[], stops: MapStop[]) {
  layer.clearLayers()
  for (const p of places) {
    L.marker([p.lat, p.lng], { icon: placeIcon(p) })
      .bindTooltip(textTooltip(p.name), { direction: "top", offset: [0, -6] })
      .addTo(layer)
  }
  for (const s of stops) {
    L.marker([s.lat, s.lng], { icon: stopIcon(s) })
      .bindTooltip(textTooltip(s.title), { direction: "top", offset: [0, -10] })
      .addTo(layer)
  }
}

/**
 * Mapa con la ubicación (simulada o real), los lugares cercanos y el itinerario de hoy.
 *
 * Leaflet directo (sin react-leaflet): el mapa se crea y se destruye en un solo efecto.
 * Next 16 "duerme" las pantallas que dejaste y al volver re-ejecuta los efectos sin
 * remontar; con react-leaflet eso agregaba capas a un mapa ya destruido.
 */
export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const userRef = useRef<L.Marker | null>(null)
  const overlaysRef = useRef<L.LayerGroup | null>(null)
  const latest = useRef(props)

  useEffect(() => {
    latest.current = props
  })

  // Crear y destruir el mapa (también al despertar la pantalla).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { position, heading, places, stops } = latest.current
    const map = L.map(el, { zoomControl: false, center: [position.lat, position.lng], zoom: INITIAL_ZOOM })
    L.tileLayer(TILES_URL, { attribution: ATTRIBUTION, maxZoom: 19, className: "rumbo-tiles" }).addTo(map)
    const overlays = L.layerGroup().addTo(map)
    drawOverlays(overlays, places, stops)
    const user = L.marker([position.lat, position.lng], { icon: userIcon(heading), draggable: true, zIndexOffset: 1000 }).addTo(map)

    user.on("dragend", () => {
      const { lat, lng } = user.getLatLng()
      latest.current.onTeleport({ lat, lng })
    })
    map.on("click", (e: L.LeafletMouseEvent) => latest.current.onTeleport({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on("dragstart", () => latest.current.onUserPan())

    mapRef.current = map
    userRef.current = user
    overlaysRef.current = overlays
    return () => {
      map.remove()
      mapRef.current = null
      userRef.current = null
      overlaysRef.current = null
    }
  }, [])

  const { position, heading, places, stops, follow } = props

  useEffect(() => {
    if (overlaysRef.current) drawOverlays(overlaysRef.current, places, stops)
  }, [places, stops])

  useEffect(() => {
    userRef.current?.setIcon(userIcon(heading))
  }, [heading])

  useEffect(() => {
    userRef.current?.setLatLng([position.lat, position.lng])
    if (follow) mapRef.current?.panTo([position.lat, position.lng], { animate: false })
  }, [position, follow])

  return <div ref={containerRef} className="size-full" />
}
