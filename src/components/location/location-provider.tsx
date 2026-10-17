"use client"

import { useRouter } from "next/navigation"
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
const STEP_INTERVAL_MS = 50
/** Tope por paso (si la pestaña estuvo frenada) para no saltar de golpe. */
const MAX_STEP_SECONDS = 1
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
  const [position, setPosition] = useState<LatLng>(DEFAULT_POSITION)
  const [heading, setHeading] = useState<number | null>(null)
  const [source, setSourceState] = useState<LocationSource>("mock")
  const [speed, setSpeed] = useState<SpeedMultiplier>(1)
  const [restored, setRestored] = useState(false)

  // Restaurar la última posición simulada después de hidratar (el server no tiene localStorage,
  // así que el primer render tiene que ser igual en los dos lados).
  useEffect(() => {
    const stored = readStored()
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza con localStorage una sola vez al montar */
    if (stored) {
      setPosition(stored.position)
      setSourceState(stored.source)
      setSpeed(stored.speed)
    }
    setRestored(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

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

  // Joystick: integrar la posición cada 50 ms mientras el vector no sea cero. Es un intervalo y no
  // requestAnimationFrame para que siga caminando aunque la pestaña quede en segundo plano.
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const setVector = useCallback((vector: Vector) => {
    vectorRef.current = vector
    if (vector.x !== 0 || vector.y !== 0) setHeading(headingFromVector(vector))
    if (loopRef.current !== null || (vector.x === 0 && vector.y === 0)) return

    let last = performance.now()
    loopRef.current = setInterval(() => {
      const v = vectorRef.current
      if (v.x === 0 && v.y === 0) {
        if (loopRef.current !== null) clearInterval(loopRef.current)
        loopRef.current = null
        return
      }
      const now = performance.now()
      const seconds = Math.min(MAX_STEP_SECONDS, (now - last) / 1000)
      last = now
      setPosition((p) => stepPosition(p, v, seconds, speedRef.current))
    }, STEP_INTERVAL_MS)
  }, [])

  useEffect(
    () => () => {
      if (loopRef.current !== null) clearInterval(loopRef.current)
    },
    []
  )

  const teleport = useCallback((next: LatLng) => {
    vectorRef.current = { x: 0, y: 0 }
    // Saltar a un lugar es ubicación simulada: el GPS real lo pisaría.
    setSourceState("mock")
    setPosition(next)
    // Se guarda ya: en /login no hay pings (que es cuando se guarda al moverse).
    writeStored({ position: next, source: "mock", speed: speedRef.current })
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
    // La ruta se lee acá y no con usePathname: el provider está en el layout raíz y
    // usePathname rompe el prerender de las rutas dinámicas (/join/[code]).
    if (!restored || NO_PINGS_PATHS.some((p) => window.location.pathname.startsWith(p))) return
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
          // El primero solo refresca si la pantalla se armó con un ping viejo de otro lado
          // (ej. el último era en París y ahora el GPS está en Montevideo).
          if (!firstPing || res.movedFar) router.refresh()
        }
      })
      .finally(() => {
        sendingRef.current = false
      })
  }, [position, heading, source, speed, router, restored])

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
