"use client"

import {
  CalendarClockIcon,
  ChevronLeftIcon,
  MapPinIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { PlaceNotification } from "@/components/rumbo/place-notification"
import { ScrollFade } from "@/components/rumbo/scroll-fade"
import { VoiceOrb } from "@/components/rumbo/voice-orb"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { useRealtimeCall } from "@/hooks/use-realtime-call"
import type { CallState, PlaceCard } from "@/hooks/voice-session-types"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<CallState, string> = {
  off: "Tocá para empezar a hablar",
  connecting: "Conectando…",
  listening: "Te escucho",
  thinking: "Pensando…",
  talking: "Hablando · podés interrumpir",
}

interface TalkClientProps {
  location: { place: string; city: string; tripDay: string | null; timeZone: string }
  nextCommitment: { title: string; startsAt: string } | null
  places: PlaceCard[]
}

export function TalkClient({ location, nextCommitment, places }: TalkClientProps) {
  const call = useRealtimeCall(places)
  const now = useNow()
  const active = call.state !== "off"
  const hasPlaces = call.places.length > 0

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="mx-auto grid w-full max-w-md grid-cols-[40px_1fr_40px] items-center px-3 pt-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Volver">
          <Link href="/">
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
        <div className="text-center">
          <p className="text-[15px] font-semibold">Rumbo</p>
          {active && (
            <p className="text-muted-foreground text-xs tabular-nums">US${call.costUsd.toFixed(call.costUsd < 0.01 ? 4 : 3)}</p>
          )}
        </div>
        <span />
      </header>

      <div className="mx-auto w-full max-w-md px-4 pt-3">
        <LocationCard location={location} nextCommitment={nextCommitment} now={now} />
      </div>

      <section
        className={cn(
          "mx-auto flex w-full max-w-md shrink-0 flex-col items-center gap-3 transition-[padding] duration-500",
          hasPlaces ? "pt-4" : "flex-1 justify-center"
        )}
      >
        <VoiceOrb
          state={call.state}
          inputVolumeRef={call.inputVolumeRef}
          outputVolumeRef={call.outputVolumeRef}
          className={cn("transition-[width] duration-500 ease-out", hasPlaces ? "w-28" : "w-56")}
        />
        <p className="text-muted-foreground h-5 text-[15px]">{STATUS_LABEL[call.state]}</p>
      </section>

      {hasPlaces && (
        <ScrollFade className="mx-auto mt-2 min-h-0 w-full max-w-md flex-1 px-4">
          <div className="flex flex-col gap-2 py-2">
            {call.places.map((place) => (
              <PlaceNotification key={place.id} place={place} now={now.getTime()} />
            ))}
          </div>
        </ScrollFade>
      )}

      <footer className="mx-auto w-full max-w-md px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {active ? (
          <div className="flex items-center justify-center gap-8">
            <RoundToggle
              on={call.micMuted}
              onClick={() => call.setMicMuted(!call.micMuted)}
              label={call.micMuted ? "Activar micrófono" : "Silenciar micrófono"}
              icon={call.micMuted ? <MicOffIcon /> : <MicIcon />}
            />
            <Button
              onClick={call.end}
              aria-label="Terminar"
              className="size-16 rounded-full bg-[#FF3B30] text-white hover:bg-[#FF3B30]/90"
            >
              {call.state === "connecting" ? <Spinner className="size-6" /> : <PhoneOffIcon className="size-6" />}
            </Button>
            <RoundToggle
              on={call.speakerMuted}
              onClick={() => call.setSpeakerMuted(!call.speakerMuted)}
              label={call.speakerMuted ? "Activar sonido" : "Silenciar sonido"}
              icon={call.speakerMuted ? <VolumeXIcon /> : <Volume2Icon />}
            />
          </div>
        ) : (
          <Button onClick={() => void call.start()} size="lg" className="h-14 w-full rounded-full text-base">
            <MicIcon className="size-5" />
            Hablar con Rumbo
          </Button>
        )}
      </footer>
    </main>
  )
}

function LocationCard({
  location,
  nextCommitment,
  now,
}: Pick<TalkClientProps, "location" | "nextCommitment"> & { now: Date }) {
  const time = (d: Date) =>
    new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone: location.timeZone }).format(d)
  const details = [location.city, time(now), location.tripDay].filter(Boolean).join(" · ")

  return (
    <Card className="gap-0 rounded-2xl py-0 shadow-none ring-0 [&>[data-slot=item]:not(:last-child)]:border-b-border">
      <Item className="rounded-none px-4 py-3">
        <ItemMedia>
          <IconTile className="bg-brand">
            <MapPinIcon />
          </IconTile>
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="text-[15px]">{location.place}</ItemTitle>
          <ItemDescription className="text-[13px]" suppressHydrationWarning>
            {details}
          </ItemDescription>
        </ItemContent>
      </Item>
      {nextCommitment && (
        <Item className="rounded-none px-4 py-3">
          <ItemMedia>
            <IconTile className="bg-[#FF9500]">
              <CalendarClockIcon />
            </IconTile>
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-[15px]">{nextCommitment.title}</ItemTitle>
            <ItemDescription className="text-[13px]" suppressHydrationWarning>
              {time(new Date(nextCommitment.startsAt))} · {untilLabel(now, new Date(nextCommitment.startsAt))}
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
    </Card>
  )
}

function IconTile({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("flex size-9 items-center justify-center rounded-[10px] text-white [&_svg]:size-[18px]", className)}>
      {children}
    </span>
  )
}

interface RoundToggleProps {
  on: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
}

function RoundToggle({ on, onClick, label, icon }: RoundToggleProps) {
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={cn("size-12 rounded-full bg-card [&_svg]:size-5", on && "bg-foreground text-background hover:bg-foreground/90")}
    >
      {icon}
    </Button>
  )
}

function untilLabel(now: Date, target: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000)
  if (minutes <= 0) return "ahora"
  if (minutes < 60) return `en ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `en ${hours} h ${rest} min` : `en ${hours} h`
}

/** Hora actual, actualizada cada 30 s. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
