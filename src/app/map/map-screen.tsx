"use client"

import { ChevronLeftIcon, LocateFixedIcon, MapPinIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Joystick } from "@/components/location/joystick"
import { useLocation, type LocationSource } from "@/components/location/location-provider"
import type { MapPlace, MapStop } from "@/components/location/map-view"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { distanceMeters, walkMinutes } from "@/lib/geo"
import { SPEED_MULTIPLIERS, type SpeedMultiplier } from "@/lib/location/simulate"

// Leaflet usa `window`: solo en el cliente.
const MapView = dynamic(() => import("@/components/location/map-view"), {
  ssr: false,
  loading: () => <div className="bg-muted size-full animate-pulse" />,
})

interface MapScreenProps {
  places: MapPlace[]
  stops: MapStop[]
}

export function MapScreen({ places, stops }: MapScreenProps) {
  const { position, heading, source, setSource, speed, setSpeed, teleport } = useLocation()
  const [follow, setFollow] = useState(true)

  const nearest = useMemo(() => {
    const [closest] = [...places].sort((a, b) => distanceMeters(position, a) - distanceMeters(position, b))
    return closest ? { name: closest.name, minutes: walkMinutes(position, closest) } : null
  }, [places, position])

  return (
    <main className="relative h-dvh overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapView
          position={position}
          heading={heading}
          places={places}
          stops={stops}
          follow={follow}
          onTeleport={(p) => {
            teleport(p)
            setFollow(true)
          }}
          onUserPan={() => setFollow(false)}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] mx-auto flex max-w-md items-center gap-2 p-3">
        <Button asChild variant="secondary" size="icon" className="bg-card pointer-events-auto rounded-full shadow-md">
          <Link href="/" aria-label="Volver">
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
        {nearest && (
          <div className="bg-card/95 pointer-events-auto flex min-w-0 items-center gap-2 rounded-full px-3.5 py-2 shadow-md backdrop-blur-xl">
            <MapPinIcon className="text-brand size-4 shrink-0" />
            <p className="truncate text-[13px]">
              <span className="font-medium">Cerca de {nearest.name}</span>
              <span className="text-muted-foreground"> · {nearest.minutes} min</span>
            </p>
          </div>
        )}
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] mx-auto flex max-w-md flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
              <p className="text-muted-foreground text-[13px]">Mové el joystick para caminar o tocá el mapa para saltar.</p>
            </>
          )}
        </div>
      </div>
    </main>
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
