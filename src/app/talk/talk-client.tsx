"use client"

import {
  CalendarClockIcon,
  ChevronLeftIcon,
  CameraIcon,
  LanguagesIcon,
  MapIcon,
  MapPinIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { addItem } from "@/app/itinerary/actions"
import { GenUiPanel } from "@/components/genui/genui-panel"

import { Joystick } from "@/components/location/joystick"
import { useLocation } from "@/components/location/location-provider"
import type { MapPlace, MapStop } from "@/components/location/map-view"
import { PlaceNotification } from "@/components/rumbo/place-notification"
import { ScrollFade } from "@/components/rumbo/scroll-fade"
import { CameraSheet } from "@/components/camera/camera-sheet"
import { TranslatorPanel } from "@/components/translate/translator-panel"
import { TALK_STATUS_IDLE, VoiceStage } from "@/components/rumbo/voice-stage"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { useGenUi } from "@/hooks/use-genui"
import { usePhotoLookup, type PhotoMatch } from "@/hooks/use-photo-lookup"
import { useRealtimeCall } from "@/hooks/use-realtime-call"
import type { CallState, PlaceCard } from "@/hooks/voice-session-types"
import type { FoundTip } from "@/app/api/translate/tips/route"
import { distanceMeters } from "@/lib/geo"
import type { GenUiPlace, GenUiRequest } from "@/lib/genui/types"
import { addMinutesIso, zonedDateKey, zonedTimeToIso, zonedTimeValue } from "@/lib/time/zoned"
import { LANGUAGES, type Lang } from "@/lib/translate/config"
import type { Utterance } from "@/lib/translate/utterances"
import { cn } from "@/lib/utils"

// Google Maps usa `window`: solo en el cliente.
const MapView = dynamic(() => import("@/components/location/map-view"), {
  ssr: false,
  loading: () => <div className="bg-muted size-full animate-pulse" />,
})

/** Más lejos que esto, la tarjeta no dice el nombre de un lugar cercano. */
const NEAR_PLACE_MAX_M = 600

/** Botones de arriba: blancos translúcidos con sombra, para que se lean sobre el glow azul. */
const GLASS_BUTTON =
  "size-10 rounded-full bg-white/85 text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-md hover:bg-white"

const STATUS_LABEL: Record<CallState, string> = {
  off: TALK_STATUS_IDLE,
  connecting: "Conectando…",
  listening: "Te escucho",
  thinking: "Pensando…",
  talking: "Hablando · podés interrumpir",
}

interface TalkClientProps {
  location: { city: string; tripDay: string | null; timeZone: string }
  nextCommitment: { title: string; startsAt: string } | null
  places: PlaceCard[]
  mapPlaces: MapPlace[]
  stops: MapStop[]
}

export function TalkClient({ location, nextCommitment, places, mapPlaces, stops }: TalkClientProps) {
  // La ubicación en vivo (joystick o GPS) llega a la llamada: tools y avisos de movimiento.
  const { position, heading, teleport, source } = useLocation()
  const positionRef = useRef(position)
  useEffect(() => {
    positionRef.current = position
  }, [position])
  const genui = useGenUi(useCallback(() => positionRef.current, []))
  const showScreen = genui.show
  const clearScreen = genui.clear
  // La pantalla la maneja la llamada: muestra los lugares del último tool del agente o se vacía.
  const onScreen = useCallback(
    (screen: { request: string; placeIds: string[] } | null) => (screen ? void showScreen(screen) : clearScreen()),
    [showScreen, clearScreen]
  )
  const call = useRealtimeCall(places, position, onScreen)
  const { note } = call

  // Lo que el viajero toca en la pantalla también se lo contamos al agente: es uno solo.
  const ask = useCallback(
    (request: string, placeIds: string[]) => {
      void showScreen({ request, placeIds })
      note(`En la pantalla, el viajero tocó: "${request}". Ya se le está mostrando; si habla de eso, seguí desde ahí.`)
    },
    [showScreen, note]
  )
  const addToPlan = useCallback(
    async (place: GenUiPlace) => {
      const slot = nextHalfHour(location.timeZone)
      const startsAt = zonedTimeToIso(zonedDateKey(new Date(), location.timeZone), slot, location.timeZone)
      const res = await addItem({
        title: null,
        placeId: place.id,
        startsAt,
        endsAt: addMinutesIso(startsAt, place.visitMinutes),
        notes: null,
        source: "agent",
        sourceRef: null,
        locked: null,
      })
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${place.name} quedó en tu plan a las ${slot}.`)
      note(`Desde la pantalla, el viajero agregó "${place.name}" a su plan de hoy a las ${slot}.`)
    },
    [location.timeZone, note]
  )

  // Modo traductor: la charla con alguien del lugar pasa por acá, y lo que recomienda
  // se muestra en la pantalla y le llega al agente (es uno solo).
  const [translating, setTranslating] = useState(false)
  const { micMuted, setMicMuted } = call
  const mutedForTranslatorRef = useRef(false)
  const openTranslator = useCallback(() => {
    // El agente no tiene que escuchar (ni contestar) la charla traducida.
    mutedForTranslatorRef.current = !micMuted
    if (!micMuted) setMicMuted(true)
    setTranslating(true)
  }, [micMuted, setMicMuted])
  const closeTranslator = useCallback(() => {
    setTranslating(false)
    if (mutedForTranslatorRef.current) setMicMuted(false)
    mutedForTranslatorRef.current = false
  }, [setMicMuted])

  // "¿Qué estoy viendo?": la foto se muestra en pantalla y el agente queda sabiendo qué es
  // (si la llamada no está abierta, se lo cuenta al abrirla).
  const [cameraOpen, setCameraOpen] = useState(false)
  const onPhotoMatch = useCallback(
    ({ name, kind, where, description, place, photoUrl }: PhotoMatch) => {
      void showScreen({
        request: `Lo que estás viendo: ${name}`,
        placeIds: place ? [place.id] : [],
        seen: { name, kind, where, description, placeId: place?.id ?? null, photoUrl },
      })
      const about = description ? ` (${description})` : ""
      note(
        kind === "lugar"
          ? `El viajero acaba de sacarle una foto con la cámara a lo que tiene enfrente: está frente a ${name}${about}. Ya se muestra en la pantalla. ` +
              `Si pregunta dónde está, decile que está frente a ${name}; no hables de distancias ni de cuánto le queda. Si pregunta por "esto", "acá" o "lo de la foto", es ${name}. Si pide la historia o más datos, llamá a place_facts con ${name}.`
          : `El viajero le sacó una foto a ${kind === "obra" ? "una obra" : "algo"}: ${name}${about}${where ? `, en ${where}` : ""}. Ya se muestra en la pantalla. ` +
              `Si pregunta qué es o por "esto" o "lo de la foto", hablá de ${name}, no del edificio. Si pide la historia o más datos, llamá a place_facts con ${name}.`,
        { keep: true }
      )
    },
    [note, showScreen]
  )
  const photo = usePhotoLookup(
    useCallback(() => positionRef.current, []),
    onPhotoMatch
  )

  const onTurn = useCallback(
    async (turn: Utterance, recent: Utterance[], conversationId: string, theirLang: Lang) => {
      const said = turn.translated || turn.original
      note(
        turn.speaker === "me"
          ? `Con el traductor, el viajero le dijo a una persona local: "${turn.original || said}". No respondas: estás escuchando.`
          : `Con el traductor, una persona local (en ${LANGUAGES[theirLang]}) dijo: "${said}". No respondas: estás escuchando.`
      )
      if (turn.speaker !== "them") return

      const res = await fetch("/api/translate/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          theirLang,
          location: positionRef.current,
          turns: recent.map(({ speaker, original, translated }) => ({
            speaker,
            original,
            translated,
          })),
        }),
      }).catch(() => null)
      const body = (await res?.json().catch(() => null)) as {
        success: boolean
        data?: { tips: FoundTip[] }
      } | null
      const tips = body?.data?.tips ?? []
      if (tips.length === 0) return

      const summary = tips.map((t) => `${t.placeName} (${t.what.replace(/\.$/, "")})`).join("; ")
      const placeIds = tips.flatMap((t) => (t.placeId ? [t.placeId] : []))
      if (placeIds.length > 0)
        void showScreen({
          request: `Lo que te recomendó la persona local: ${summary}`,
          placeIds,
        })
      else toast(`Anoté lo que te recomendó: ${summary}`)
      note(
        `La persona local recomendó: ${summary}. ${placeIds.length > 0 ? "Ya se muestra en la pantalla. " : ""}Quedó guardado; si después pregunta, retomalo.`
      )
    },
    [note, showScreen]
  )

  // Solo en desarrollo: probar la UI generativa sin micrófono (window.rumboShow("llevame al Picasso"),
  // o un pedido completo con lugares, historia, foto o frase).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const w = window as unknown as { rumboShow?: (request: string | GenUiRequest) => void }
    w.rumboShow = (request) => void showScreen(typeof request === "string" ? { request, placeIds: [] } : request)
    return () => {
      delete w.rumboShow
    }
  }, [showScreen])
  const now = useNow()
  // Arranca mínima: el mapa se abre con el botón de arriba.
  const [showMap, setShowMap] = useState(false)
  // Cuando llega una pantalla generada, el mapa se cierra para darle lugar.
  const screenId = genui.screen?.id
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- responde a una pantalla nueva que llega por streaming
    if (screenId) setShowMap(false)
  }, [screenId])
  const active = call.state !== "off"
  const hasPlaces = call.places.length > 0 || genui.screen !== null

  const placeName = useMemo(() => {
    const [closest] = [...mapPlaces].sort((a, b) => distanceMeters(position, a) - distanceMeters(position, b))
    return closest && distanceMeters(position, closest) <= NEAR_PLACE_MAX_M ? `Cerca de ${closest.name}` : "Sin lugares cargados cerca"
  }, [mapPlaces, position])

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {/* Solo volver y el mapa, flotando: se tienen que ver sobre el glow. */}
      <header className="animate-in fade-in absolute inset-x-0 top-0 z-30 mx-auto duration-500 flex w-full max-w-md items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button asChild variant="ghost" size="icon" className={GLASS_BUTTON} aria-label="Volver">
          <Link href="/">
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(GLASS_BUTTON, showMap && "bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
          aria-label={showMap ? "Ocultar mapa" : "Mostrar mapa"}
          aria-pressed={showMap}
          onClick={() => setShowMap(!showMap)}
        >
          <MapIcon className="size-5" />
        </Button>
      </header>

      {showMap && (
        <div className="animate-in fade-in slide-in-from-top-2 absolute inset-x-0 top-16 z-20 mx-auto w-full max-w-md px-4 duration-300">
          <div className="overflow-hidden rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            <LocationCard
              location={location}
              placeName={placeName}
              nextCommitment={nextCommitment}
              now={now}
              map={
                <div className="relative h-44">
                  <MapView
                    position={position}
                    heading={heading}
                    places={mapPlaces}
                    stops={stops}
                    follow
                    onTeleport={teleport}
                    onUserPan={() => undefined}
                  />
                  {source === "mock" && <Joystick size={80} className="absolute right-2 bottom-2 z-[1000]" />}
                </div>
              }
            />
          </div>
        </div>
      )}

      {translating ? (
        <TranslatorPanel location={position} onTurn={onTurn} onExit={closeTranslator}>
          {genui.screen && (
            <ScrollFade className="max-h-[45%] min-h-0 shrink-0">
              <div className="py-2">
                <GenUiPanel key={genui.screen.id} screen={genui.screen} ask={ask} addToPlan={addToPlan} />
              </div>
            </ScrollFade>
          )}
        </TranslatorPanel>
      ) : (
        <>
          {/* El blob: en el medio, o arriba como glow cuando hay recomendaciones. */}
          <VoiceStage
            state={call.state}
            inputVolumeRef={call.inputVolumeRef}
            outputVolumeRef={call.outputVolumeRef}
            glow={hasPlaces}
            status={STATUS_LABEL[call.state]}
            onStart={() => void call.start()}
            className="absolute inset-x-0 top-[30%] z-0"
          />

          {!hasPlaces && <div className="flex-1" />}

          {hasPlaces && (
            <ScrollFade className="relative z-10 mx-auto min-h-0 w-full max-w-md flex-1 px-4 pt-28">
              <div className="flex flex-col gap-2 py-2">
                {genui.screen ? (
                  <GenUiPanel key={genui.screen.id} screen={genui.screen} ask={ask} addToPlan={addToPlan} />
                ) : (
                  call.places.map((place) => <PlaceNotification key={place.id} place={place} now={now.getTime()} />)
                )}
              </div>
            </ScrollFade>
          )}

          <footer className="animate-in fade-in slide-in-from-bottom-2 relative z-10 mx-auto duration-500 w-full max-w-md px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {active ? (
              <div className="flex items-center justify-center gap-4">
                <RoundToggle
                  on={call.micMuted}
                  onClick={() => call.setMicMuted(!call.micMuted)}
                  label={call.micMuted ? "Activar micrófono" : "Silenciar micrófono"}
                  icon={call.micMuted ? <MicOffIcon /> : <MicIcon />}
                />
                <ToolButton label="Sacar foto" icon={<CameraIcon />} busy={photo.busy} onClick={() => setCameraOpen(true)} />
                <Button
                  onClick={call.end}
                  aria-label="Terminar"
                  className="size-16 rounded-full bg-[#FF3B30] text-white hover:bg-[#FF3B30]/90"
                >
                  {call.state === "connecting" ? <Spinner className="size-6" /> : <PhoneOffIcon className="size-6" />}
                </Button>
                <ToolButton label="Traducir" icon={<LanguagesIcon />} onClick={openTranslator} />
                <RoundToggle
                  on={call.speakerMuted}
                  onClick={() => call.setSpeakerMuted(!call.speakerMuted)}
                  label={call.speakerMuted ? "Activar sonido" : "Silenciar sonido"}
                  icon={call.speakerMuted ? <VolumeXIcon /> : <Volume2Icon />}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button onClick={() => void call.start()} size="lg" className="h-14 flex-1 rounded-full text-base">
                  <MicIcon className="size-5" />
                  Hablar con Rumbo
                </Button>
                <ToolButton label="Sacar foto" icon={<CameraIcon />} busy={photo.busy} onClick={() => setCameraOpen(true)} />
                <ToolButton label="Traducir" icon={<LanguagesIcon />} onClick={openTranslator} />
              </div>
            )}
          </footer>
        </>
      )}
      <CameraSheet open={cameraOpen} onOpenChange={setCameraOpen} onPhoto={(blob) => void photo.look(blob)} />
    </main>
  )
}

interface LocationCardProps extends Pick<TalkClientProps, "location" | "nextCommitment"> {
  placeName: string
  now: Date
  map: React.ReactNode
}

function LocationCard({ location, placeName, nextCommitment, now, map }: LocationCardProps) {
  const time = (d: Date) => new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone: location.timeZone }).format(d)
  const details = [location.city, time(now), location.tripDay].filter(Boolean).join(" · ")

  return (
    <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-none ring-0 [&>[data-slot=item]:not(:last-child)]:border-b-border">
      {map}
      <Item className="rounded-none px-4 py-3">
        <ItemMedia>
          <IconTile className="bg-brand">
            <MapPinIcon />
          </IconTile>
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="text-[15px]">{placeName}</ItemTitle>
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

function ToolButton({ label, icon, onClick, busy = false }: { label: string; icon: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className="bg-card size-12 shrink-0 rounded-full [&_svg]:size-5"
    >
      {busy ? <Spinner /> : icon}
    </Button>
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

const SLOT_MS = 30 * 60_000

/** Próxima media hora en la zona del viaje ("16:30"). */
function nextHalfHour(timeZone: string): string {
  const rounded = Math.ceil(Date.now() / SLOT_MS) * SLOT_MS
  return zonedTimeValue(new Date(rounded).toISOString(), timeZone)
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
