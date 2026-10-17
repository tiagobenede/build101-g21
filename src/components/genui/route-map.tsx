"use client"

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { useMemo } from "react"
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet"

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

/** Mapa chico con la caminata en línea recta desde donde estás hasta el lugar. */
export default function RouteMapView({ from, to, category }: RouteMapViewProps) {
  const bounds = useMemo(
    () => L.latLngBounds([from.lat, from.lng], [to.lat, to.lng]).pad(0.35),
    [from.lat, from.lng, to.lat, to.lng]
  )
  return (
    <MapContainer bounds={bounds} zoomControl={false} attributionControl={false} dragging={false} scrollWheelZoom={false} className="size-full">
      <TileLayer url={TILES_URL} attribution={ATTRIBUTION} className="rumbo-tiles" />
      <Polyline
        positions={[
          [from.lat, from.lng],
          [to.lat, to.lng],
        ]}
        pathOptions={{ color: "#0071E3", weight: 5, opacity: 0.9, dashArray: "1 10", lineCap: "round" }}
      />
      <Marker position={[from.lat, from.lng]} icon={dot("#0071E3", 18)} interactive={false} />
      <Marker position={[to.lat, to.lng]} icon={dot(categoryColor(category), 22)} interactive={false} />
    </MapContainer>
  )
}
