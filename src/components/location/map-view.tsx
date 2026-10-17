"use client"

import "leaflet/dist/leaflet.css"

import L from "leaflet"
import { useEffect, useMemo } from "react"
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet"

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

function Interactions({ position, follow, onTeleport, onUserPan }: Omit<MapViewProps, "heading" | "places" | "stops">) {
  const map = useMap()
  useMapEvents({
    click: (e) => onTeleport({ lat: e.latlng.lat, lng: e.latlng.lng }),
    dragstart: onUserPan,
  })
  useEffect(() => {
    if (follow) map.panTo([position.lat, position.lng], { animate: false })
  }, [follow, map, position])
  return null
}

/** Mapa con la ubicación (simulada o real), los lugares cercanos y el itinerario de hoy. */
export default function MapView({ position, heading, places, stops, follow, onTeleport, onUserPan }: MapViewProps) {
  const icon = useMemo(() => userIcon(heading), [heading])

  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={INITIAL_ZOOM}
      zoomControl={false}
      className="size-full"
    >
      <TileLayer url={TILES_URL} attribution={ATTRIBUTION} maxZoom={19} className="rumbo-tiles" />
      {places.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={placeIcon(p)}>
          <Tooltip direction="top" offset={[0, -6]}>
            {p.name}
          </Tooltip>
        </Marker>
      ))}
      {stops.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(s)}>
          <Tooltip direction="top" offset={[0, -10]}>
            {s.title}
          </Tooltip>
        </Marker>
      ))}
      <Marker
        position={[position.lat, position.lng]}
        icon={icon}
        zIndexOffset={1000}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const { lat, lng } = (e.target as L.Marker).getLatLng()
            onTeleport({ lat, lng })
          },
        }}
      />
      <Interactions position={position} follow={follow} onTeleport={onTeleport} onUserPan={onUserPan} />
    </MapContainer>
  )
}
