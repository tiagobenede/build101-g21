"use client"

import tzLookup from "@photostructure/tz-lookup"
import { LocateFixedIcon, MapPinIcon, SearchIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Joystick } from "@/components/location/joystick"
import { LocationSearch } from "@/components/location/location-search"
import { useLocation, type LocationSource } from "@/components/location/location-provider"
import type { MapPlace, MapStop } from "@/components/location/map-view"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { clientNow, useClock } from "@/hooks/use-clock"
import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo"
import { SPEED_MULTIPLIERS, type SpeedMultiplier } from "@/lib/location/simulate"
import { zonedDateKey, zonedTimeToIso, zonedTimeValue } from "@/lib/time/zoned"

// Google Maps usa `window`: solo en el cliente.
const MapView = dynamic(() => import("@/components/location/map-view"), {
  ssr: false,
  loading: () => <div className="bg-muted size-full animate-pulse" />,
})

/** Más lejos que esto, el cartel no dice "cerca de" (por ejemplo, si saltaste a otra ciudad). */
const NEARBY_LABEL_MAX_M = 2_000

interface MapScreenProps {
  places: MapPlace[]
  stops: MapStop[]
}

export function MapScreen({ places, stops }: MapScreenProps) {
  const { position, heading, source, setSource, speed, setSpeed, teleport } = useLocation()
  const [follow, setFollow] = useState(true)
  const [searching, setSearching] = useState(false)
  const [jumpLabel, setJumpLabel] = useState<string | null>(null)

  const nearest = useMemo(() => {
    const [closest] = [...places].sort((a, b) => distanceMeters(position, a) - distanceMeters(position, b))
    if (!closest || distanceMeters(position, closest) > NEARBY_LABEL_MAX_M) return null
    return { name: closest.name, minutes: walkMinutes(position, closest) }
  }, [places, position])

  const jumpTo = (next: LatLng, label: string | null) => {
    teleport(next)
    setJumpLabel(label)
    setFollow(true)
  }

  return (
    <main className="relative h-dvh overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapView
          position={position}
          heading={heading}
          places={places}
          stops={stops}
          follow={follow}
          onTeleport={(p) => jumpTo(p, null)}
          onUserPan={() => setFollow(false)}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-md items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {searching ? (
          <LocationSearch
            onClose={() => setSearching(false)}
            onSelect={(r) => {
              jumpTo({ lat: r.lat, lng: r.lng }, r.name)
              setSearching(false)
            }}
          />
        ) : (
          <>
            <div className="bg-card/95 pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 py-2 shadow-md backdrop-blur-xl">
              <MapPinIcon className="text-brand size-4 shrink-0" />
              <p className="truncate text-[13px]">
                {nearest ? (
                  <>
                    <span className="font-medium">Cerca de {nearest.name}</span>
                    <span className="text-muted-foreground"> · {nearest.minutes} min</span>
                  </>
                ) : (
                  <span className="font-medium">{jumpLabel ?? "Sin lugares cargados cerca"}</span>
                )}
              </p>
            </div>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Ir a otro lugar"
              className="bg-card pointer-events-auto shrink-0 rounded-full shadow-md"
              onClick={() => setSearching(true)}
            >
              <SearchIcon className="size-5" />
            </Button>
          </>
        )}
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-md flex-col gap-3 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between">
          {!follow ? (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Centrar en mi ubicación"
              className="bg-card pointer-events-auto size-11 rounded-full shadow-md"
              onClick={() => setFollow(true)}
            >
              <LocateFixedIcon className="text-brand size-5" />
            </Button>
          ) : (
            <span />
          )}
          {source === "mock" && <Joystick className="pointer-events-auto" />}
        </div>

        <div className="bg-card/95 pointer-events-auto flex flex-col gap-3 rounded-3xl p-4 shadow-lg backdrop-blur-xl">
          <ControlRow label="Ubicación">
            <ToggleGroup
              type="single"
              value={source}
              onValueChange={(v) => v && setSource(v as LocationSource)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="mock">Simulada</ToggleGroupItem>
              <ToggleGroupItem value="real">GPS real</ToggleGroupItem>
            </ToggleGroup>
          </ControlRow>
          <ClockRow position={position} />
          {source === "mock" && (
            <>
              <ControlRow label="Velocidad">
                <ToggleGroup
                  type="single"
                  value={String(speed)}
                  onValueChange={(v) => v && setSpeed(Number(v) as SpeedMultiplier)}
                  variant="outline"
                  size="sm"
                >
                  {SPEED_MULTIPLIERS.map((m) => (
                    <ToggleGroupItem key={m} value={String(m)} className="tabular-nums">
                      x{m}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </ControlRow>
              <p className="text-muted-foreground text-[13px]">
                Mové el joystick, arrastrá el pin o tocá el mapa. Con la lupa saltás a cualquier lugar del mundo.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

/** Hora simulada (o la real), en la hora local de donde está el pin. */
function ClockRow({ position }: { position: LatLng }) {
  const router = useRouter()
  const { offsetMs, setOffsetMs } = useClock()
  const [simulated, setSimulated] = useState(offsetMs !== 0)
  // null hasta montar: la hora depende del reloj del cliente y no tiene que entrar al HTML del server.
  const [realMs, setRealMs] = useState<number | null>(null)
  const timeZone = useMemo(() => {
    try {
      return tzLookup(position.lat, position.lng)
    } catch {
      return "UTC"
    }
  }, [position.lat, position.lng])

  // El reloj corre: se muestra la hora (simulada o real) y se actualiza cada 15 s.
  useEffect(() => {
    const timer = setInterval(() => setRealMs(Date.now()), 15_000)
    const first = setTimeout(() => setRealMs(Date.now()), 0)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, [])
  const now = realMs === null ? null : new Date(realMs + offsetMs)

  const apply = (next: number) => {
    setOffsetMs(next)
    setRealMs(Date.now())
    // Las pantallas del server (plan de hoy, lugares abiertos) se rearman con la hora nueva.
    router.refresh()
  }
  const pickTime = (hhmm: string) => {
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return
    const target = new Date(zonedTimeToIso(zonedDateKey(clientNow(), timeZone), hhmm, timeZone))
    apply(target.getTime() - Date.now())
  }

  return (
    <>
      <ControlRow label="Hora">
        <ToggleGroup
          type="single"
          value={simulated ? "mock" : "real"}
          onValueChange={(v) => {
            if (!v) return
            setSimulated(v === "mock")
            if (v === "real") apply(0)
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="mock">Simulada</ToggleGroupItem>
          <ToggleGroupItem value="real">Real</ToggleGroupItem>
        </ToggleGroup>
      </ControlRow>
      {simulated && now && (
        <ControlRow label={`Hora en ${timeZone.split("/").pop()?.replace(/_/g, " ")}`}>
          <Input
            type="time"
            aria-label="Hora simulada"
            className="h-8 w-32 tabular-nums"
            value={zonedTimeValue(now.toISOString(), timeZone)}
            onChange={(e) => pickTime(e.target.value)}
          />
        </ControlRow>
      )}
    </>
  )
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[15px]">{label}</span>
      {children}
    </div>
  )
}
