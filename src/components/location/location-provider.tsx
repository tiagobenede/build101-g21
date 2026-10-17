"use client"

import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { savePing } from "@/app/location/actions"
import type { LatLng } from "@/lib/geo"
import {
  headingFromVector,
  shouldRefresh,
  shouldSendPing,
  stepPosition,
  type PingMark,
  type SpeedMultiplier,
  type Vector,
} from "@/lib/location/simulate"

export type LocationSource = "mock" | "real"

/** Punto de partida de la demo (Centre Pompidou) si no hay posición guardada. */
export const DEFAULT_POSITION: LatLng = { lat: 48.8606, lng: 2.3522 }

const STORAGE_KEY = "rumbo.location"
const NO_PINGS_PATHS = ["/login"]

interface LocationContextValue {
  position: LatLng
  /** Grados desde el norte; null si no se sabe. */
  heading: number | null
  source: LocationSource
  setSource: (source: LocationSource) => void
  speed: SpeedMultiplier
  setSpeed: (speed: SpeedMultiplier) => void
  /** Vector del joystick (x = este, y = norte, -1..1). {0,0} para frenar. */
  setVector: (vector: Vector) => void
  teleport: (position: LatLng) => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

type Stored = { position: LatLng; source: LocationSource; speed: SpeedMultiplier }

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

function writeStored(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Sin storage (modo privado): la posición vuelve al punto de partida al recargar.
  }
}

/**
 * Única fuente de ubicación de la app. Nadie llama a `navigator.geolocation`
 * directamente: se usa `useLocation()`. Vive en el layout raíz para que el
 * joystick siga moviendo el pin aunque cambies de pantalla.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  // La última posición simulada se restaura de localStorage (en el server no hay: queda el default).
  const [stored] = useState(readStored)
  const [position, setPosition] = useState<LatLng>(stored?.position ?? DEFAULT_POSITION)
  const [heading, setHeading] = useState<number | null>(null)
  const [source, setSourceState] = useState<LocationSource>(stored?.source ?? "mock")
  const [speed, setSpeed] = useState<SpeedMultiplier>(stored?.speed ?? 1)

  const vectorRef = useRef<Vector>({ x: 0, y: 0 })
  const speedRef = useRef<SpeedMultiplier>(speed)
  const lastPingRef = useRef<PingMark | null>(null)
  const lastRefreshRef = useRef<LatLng | null>(null)

  const setSource = useCallback((next: LocationSource) => {
    if (next === "real" && !("geolocation" in navigator)) {
      toast.error("Este navegador no tiene GPS. Sigo con la ubicación simulada.")
      return
    }
    setSourceState(next)
  }, [])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  // Joystick: integrar la posición por frame mientras el vector no sea cero.
  const loopRef = useRef<number | null>(null)
  const setVector = useCallback((vector: Vector) => {
    vectorRef.current = vector
    if (vector.x !== 0 || vector.y !== 0) setHeading(headingFromVector(vector))
    if (loopRef.current !== null || (vector.x === 0 && vector.y === 0)) return

    let last = performance.now()
    const tick = (now: number) => {
      const v = vectorRef.current
      if (v.x === 0 && v.y === 0) {
        loopRef.current = null
        return
      }
      const seconds = Math.min(0.5, (now - last) / 1000)
      last = now
      setPosition((p) => stepPosition(p, v, seconds, speedRef.current))
      loopRef.current = requestAnimationFrame(tick)
    }
    loopRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(
    () => () => {
      if (loopRef.current !== null) cancelAnimationFrame(loopRef.current)
    },
    []
  )

  const teleport = useCallback((next: LatLng) => {
    vectorRef.current = { x: 0, y: 0 }
    setPosition(next)
  }, [])

  // GPS real: solo cuando la fuente es "real".
  useEffect(() => {
    if (source !== "real") return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setHeading(Number.isFinite(pos.coords.heading) ? pos.coords.heading : null)
      },
      () => {
        toast.error("No tengo permiso de ubicación. Sigo con la simulada.")
        setSourceState("mock")
      },
      { enableHighAccuracy: true }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [source])

  // Pings al server (cada 5 s o 25 m) y refresh de las pantallas al moverse 100 m.
  const sendingRef = useRef(false)
  useEffect(() => {
    if (NO_PINGS_PATHS.some((p) => pathname.startsWith(p))) return
    const now = Date.now()
    if (sendingRef.current || !shouldSendPing(lastPingRef.current, position, now)) return

    sendingRef.current = true
    lastPingRef.current = { position, at: now }
    writeStored({ position, source, speed })
    void savePing({ lat: position.lat, lng: position.lng, heading, source })
      .then((res) => {
        if (res.success && shouldRefresh(lastRefreshRef.current, position)) {
          const firstPing = lastRefreshRef.current === null
          lastRefreshRef.current = position
          if (!firstPing) router.refresh()
        }
      })
      .finally(() => {
        sendingRef.current = false
      })
  }, [position, heading, source, speed, pathname, router])

  const value = useMemo<LocationContextValue>(
    () => ({ position, heading, source, setSource, speed, setSpeed, setVector, teleport }),
    [position, heading, source, setSource, speed, setVector, teleport]
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error("useLocation() tiene que usarse dentro de <LocationProvider>.")
  return ctx
}
