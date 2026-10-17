"use client"

import "@/lib/genui/no-devtools"

import type { ComponentRenderer } from "@openuidev/react-lang"
import {
  BookOpenIcon,
  CalendarPlusIcon,
  CameraIcon,
  CloudSunIcon,
  FootprintsIcon,
  LoaderCircleIcon,
  LockIcon,
  NavigationIcon,
  StarIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { createContext, useContext, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { CategoryIcon, categoryColor } from "@/components/rumbo/category-icon"
import { PlaceThumb } from "@/components/rumbo/place-thumb"
import { Button } from "@/components/ui/button"
import { useLocation } from "@/components/location/location-provider"
import { useWalkingRoute } from "@/hooks/use-walking-route"
import { buildGenUiLibrary, type GenUiComponentName, type genUiSchemas } from "@/lib/genui/library"
import type { GenUiData, GenUiPlace } from "@/lib/genui/types"
import { formatDistance, distanceMeters, walkMinutes } from "@/lib/geo"
import { pathMeters, remainingWalk, REROUTE_METERS } from "@/lib/maps/walk-progress"
import { cn } from "@/lib/utils"
import type { z } from "zod"

// Google Maps usa `window`: solo en el cliente.
const RouteMapView = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <div className="bg-muted size-full animate-pulse" />,
})

/** Lo que los componentes generados necesitan del resto de la app. */
export interface GenUiEnv {
  data: GenUiData
  /** Pedir otra pantalla (ej. "Llevame" → ruta a ese lugar). */
  ask: (request: string, placeIds: string[]) => void
  addToPlan: (place: GenUiPlace) => void
}

const GenUiEnvContext = createContext<GenUiEnv | null>(null)

export function GenUiEnvProvider({ value, children }: { value: GenUiEnv; children: ReactNode }) {
  return <GenUiEnvContext.Provider value={value}>{children}</GenUiEnvContext.Provider>
}

function useEnv(): GenUiEnv {
  const env = useContext(GenUiEnvContext)
  if (!env) throw new Error("Los componentes generativos necesitan <GenUiEnvProvider>.")
  return env
}

/** Busca un lugar por id; si el modelo inventó un id, el bloque no se dibuja. */
function usePlace(id: string | null | undefined): GenUiPlace | null {
  const { data } = useEnv()
  return id ? (data.places[id] ?? null) : null
}

type Props<N extends keyof typeof genUiSchemas> = z.infer<(typeof genUiSchemas)[N]>

const enter = "animate-in fade-in slide-in-from-bottom-2 zoom-in-[0.98] duration-500 fill-mode-both"

const Screen: ComponentRenderer<{ blocks: unknown[] }> = ({ props, renderNode }) => (
  <div className="flex flex-col gap-2.5">
    {props.blocks.map((block, i) => (
      <div key={i} className={enter}>
        {renderNode(block)}
      </div>
    ))}
  </div>
)

const Say: ComponentRenderer<Props<"Say">> = ({ props }) => (
  <p className="px-1 text-[17px] leading-snug font-medium text-pretty">{props.text}</p>
)

/** Menos que esto para cerrar: se avisa en naranja. */
const CLOSING_SOON_MINUTES = 60

/** "Abierto hasta 18:00", "Cierra en 40 min" o "Cerrado"; nada si no se sabe. */
function OpenStatus({ place }: { place: GenUiPlace }) {
  if (place.openNow === false) return <span className="font-medium text-[#D70015]">Cerrado</span>
  if (place.closesInMinutes !== null && place.closesInMinutes <= CLOSING_SOON_MINUTES)
    return <span className="font-medium text-[#C93400]">Cierra en {place.closesInMinutes} min</span>
  if (place.openNow)
    return <span className="font-medium text-[#248A3D]">{place.closesAt ? `Abierto hasta ${place.closesAt}` : "Abierto"}</span>
  return null
}

/** `walk` en false: ya estás ahí (lo que reconoció la cámara), los minutos a pie confunden. */
function PlaceMeta({ place, walk = true }: { place: GenUiPlace; walk?: boolean }) {
  return (
    <span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums">
      <OpenStatus place={place} />
      <span>{place.category}</span>
      {walk && (
        <span className="inline-flex items-center gap-1">
          <FootprintsIcon className="size-3" />
          {place.walkMinutes} min
        </span>
      )}
      {place.category !== "Hotel" && <span>~{place.visitMinutes} min de visita</span>}
      {place.rating && (
        <span className="inline-flex items-center gap-0.5">
          <StarIcon className="size-3 fill-[#FF9500] text-[#FF9500]" />
          {place.rating}
        </span>
      )}
    </span>
  )
}

const PlaceHero: ComponentRenderer<Props<"PlaceHero">> = ({ props }) => {
  const place = usePlace(props.placeId)
  const { ask, addToPlan } = useEnv()
  const [photoOk, setPhotoOk] = useState(true)
  if (!place) return null
  const color = categoryColor(place.category)
  return (
    <article className="bg-card overflow-hidden rounded-[22px]">
      <div
        className="relative flex h-40 items-end p-3"
        style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #1D1D1F))` }}
      >
        {place.photoUrl && photoOk && (
          // Foto de Google, de un dominio que cambia: <img> y no next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={place.photoUrl}
            alt=""
            onError={() => setPhotoOk(false)}
            className="animate-in fade-in absolute inset-0 size-full object-cover duration-500"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />
        <span className="absolute top-3 right-3 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          Para vos
        </span>
      </div>
      <div className="flex flex-col gap-1.5 p-3.5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 className="text-[17px] leading-tight font-semibold">{place.name}</h3>
            <PlaceMeta place={place} />
          </div>
          <CategoryIcon category={place.category} className="size-10 shrink-0" />
        </div>
        <p className="text-[14px] leading-snug">{props.reason}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <Button size="sm" className="h-9 rounded-full" onClick={() => ask(`Llevame a ${place.name}`, [place.id])}>
            <NavigationIcon className="size-3.5" />
            Llevame
          </Button>
          <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => addToPlan(place)}>
            <CalendarPlusIcon className="size-3.5" />
            Al plan
          </Button>
        </div>
      </div>
    </article>
  )
}

const PlaceList: ComponentRenderer<Props<"PlaceList">> = ({ props }) => {
  const { data, ask } = useEnv()
  // El modelo a veces repite un id: cada lugar una vez.
  const places = [...new Set(props.placeIds)].map((id) => data.places[id]).filter((p): p is GenUiPlace => Boolean(p))
  if (places.length === 0) return null
  return (
    <div className="bg-card divide-border divide-y overflow-hidden rounded-[18px]">
      {places.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => ask(`Llevame a ${p.name}`, [p.id])}
          className="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
        >
          <PlaceThumb category={p.category} photoUrl={p.photoUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px]">{p.name}</span>
            <PlaceMeta place={p} />
          </span>
        </button>
      ))}
    </div>
  )
}

const RouteMap: ComponentRenderer<Props<"RouteMap">> = ({ props }) => {
  const place = usePlace(props.placeId)
  if (!place) return null
  return <RouteMapCard place={place} />
}

function RouteMapCard({ place }: { place: GenUiPlace }) {
  const { data } = useEnv()
  // Tu posición en vivo (GPS o joystick): el mapa te sigue mientras caminás.
  const { position } = useLocation()
  // La ruta se vuelve a pedir recién al alejarte del origen de la vigente (no a cada paso).
  const [routeFrom, setRouteFrom] = useState(data.origin)
  if (distanceMeters(routeFrom, position) >= REROUTE_METERS) setRouteFrom(position)
  const { route, failed } = useWalkingRoute(routeFrom, place)
  const [expanded, setExpanded] = useState(false)
  // Lo que falta, sobre la ruta: los minutos bajan a medida que avanzás.
  const meters = route ? pathMeters(remainingWalk(position, route.path, place)) : distanceMeters(position, place)
  const minutes = route
    ? Math.max(1, Math.round((route.minutes * meters) / Math.max(route.meters, 1)))
    : walkMinutes(position, place)
  const path = route?.path ?? null
  const subtitle = failed ? "Caminando, en línea recta en el mapa" : "Caminando"
  return (
    <article className="bg-card overflow-hidden rounded-[22px]">
      <div className="relative h-44">
        <RouteMapView from={position} to={place} category={place.category} path={path} />
        <button
          type="button"
          aria-label="Agrandar el mapa"
          onClick={() => setExpanded(true)}
          className="absolute inset-0 z-[1] cursor-zoom-in"
        />
        <div className="bg-card/95 pointer-events-none absolute top-2.5 right-2.5 z-[2] rounded-xl px-3 py-1.5 shadow-md backdrop-blur-md">
          <span className="block text-[17px] leading-tight font-semibold tabular-nums">{minutes} min</span>
          <span className="text-muted-foreground text-[11px]">{formatDistance(meters)} a pie</span>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3">
        <CategoryIcon category={place.category} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{place.name}</span>
          <span className="text-muted-foreground text-[13px]">{subtitle}</span>
        </span>
      </div>
      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Mapa hasta ${place.name}`}
            className="bg-background animate-in fade-in zoom-in-[0.98] fixed inset-0 z-[3000] duration-200"
            onKeyDown={(e) => e.key === "Escape" && setExpanded(false)}
          >
            <RouteMapView from={position} to={place} category={place.category} path={path} interactive />
            <Button
              size="icon"
              variant="secondary"
              aria-label="Cerrar el mapa"
              autoFocus
              onClick={() => setExpanded(false)}
              className="bg-card/95 absolute top-[max(1rem,env(safe-area-inset-top))] left-4 size-11 rounded-full shadow-md backdrop-blur-md"
            >
              <XIcon className="size-5" />
            </Button>
            <div className="bg-card/95 absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-[22px] p-4 shadow-lg backdrop-blur-md">
              <CategoryIcon category={place.category} className="size-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{place.name}</span>
                <span className="text-muted-foreground text-[13px]">{subtitle}</span>
              </span>
              <span className="text-right">
                <span className="block text-[22px] leading-tight font-semibold tabular-nums">{minutes} min</span>
                <span className="text-muted-foreground text-[12px]">{formatDistance(meters)} a pie</span>
              </span>
            </div>
          </div>,
          document.body
        )}
    </article>
  )
}

const Compare: ComponentRenderer<Props<"Compare">> = ({ props }) => {
  const { data } = useEnv()
  // El modelo a veces repite un id: cada lugar una vez.
  const places = [...new Set(props.placeIds)].map((id) => data.places[id]).filter((p): p is GenUiPlace => Boolean(p))
  if (places.length < 2) return null
  const closest = Math.min(...places.map((p) => p.walkMinutes))
  const best = Math.max(...places.map((p) => p.rating ?? 0))
  return (
    <div className="bg-card overflow-x-auto rounded-[18px]">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-muted-foreground text-left text-[11px]">
            <th className="px-3.5 py-2 font-semibold">Lugar</th>
            <th className="px-2 py-2 font-semibold">A pie</th>
            <th className="px-3.5 py-2 font-semibold">Rating</th>
          </tr>
        </thead>
        <tbody>
          {places.map((p) => (
            <tr key={p.id} className="border-border border-t">
              <td className="px-3.5 py-2.5 font-medium">{p.name}</td>
              <td className={cn("px-2 py-2.5", p.walkMinutes === closest && "font-semibold text-[#248A3D]")}>{p.walkMinutes} min</td>
              <td className={cn("px-3.5 py-2.5", p.rating === best && "font-semibold text-[#248A3D]")}>
                {p.rating ? `★ ${p.rating}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Stop: ComponentRenderer<Props<"Stop">> = ({ props }) => {
  const place = usePlace(props.placeId)
  const { data } = useEnv()
  const title = place?.name ?? props.title
  if (!title) return null
  const fixed = !place && data.itineraryTitles.some((t) => t.toLowerCase() === title.toLowerCase())
  return (
    <div className="grid grid-cols-[44px_14px_1fr] items-start gap-2">
      <span className="text-[13px] leading-5 font-semibold tabular-nums">{props.time}</span>
      <span className="flex justify-center pt-1">
        <span
          className="size-2.5 rounded-full border-2"
          style={{ borderColor: place ? categoryColor(place.category) : "#FF9500" }}
        />
      </span>
      <span className="pb-3">
        <span className="block text-[15px] leading-5">{title}</span>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-[12px]">
          {fixed ? (
            <>
              <LockIcon className="size-3" /> De tu itinerario
            </>
          ) : place ? (
            `${place.category} · ${place.walkMinutes} min a pie`
          ) : null}
        </span>
      </span>
    </div>
  )
}

const Timeline: ComponentRenderer<{ stops: unknown[] }> = ({ props, renderNode }) => (
  <div className="bg-card rounded-[18px] px-3.5 pt-3">
    {props.stops.map((stop, i) => (
      <div key={i} className="animate-in fade-in slide-in-from-left-2 fill-mode-both duration-500" style={{ animationDelay: `${i * 60}ms` }}>
        {renderNode(stop)}
      </div>
    ))}
  </div>
)

const Weather: ComponentRenderer<Props<"Weather">> = () => {
  const { data } = useEnv()
  if (!data.weather) return null
  return (
    <span className="bg-card inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[13px]">
      <CloudSunIcon className="text-brand size-4" />
      {data.weather}
    </span>
  )
}

/** Respaldo sin red: la voz del sistema (robótica, pero mejor que nada). */
function speakWithSystem(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

/** Audio de ElevenLabs por frase, para no pedirlo de nuevo al tocar otra vez. */
const phraseAudio = new Map<string, string>()

async function phraseAudioUrl(text: string, lang: string): Promise<string> {
  const key = `${lang}|${text}`
  const hit = phraseAudio.get(key)
  if (hit) return hit
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  phraseAudio.set(key, url)
  return url
}

const Phrase: ComponentRenderer<Props<"Phrase">> = () => {
  const { data } = useEnv()
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle")
  const phrase = data.phrase
  if (!phrase) return null

  const play = async () => {
    if (state !== "idle") return
    setState("loading")
    try {
      const audio = new Audio(await phraseAudioUrl(phrase.text, phrase.lang))
      audio.onended = () => setState("idle")
      audio.onerror = () => setState("idle")
      await audio.play()
      setState("playing")
    } catch {
      speakWithSystem(phrase.text, phrase.lang)
      setState("idle")
    }
  }

  return (
    <article className="bg-card flex flex-col gap-2 rounded-[22px] p-4">
      <p className="text-[22px] leading-tight font-semibold text-pretty" lang={phrase.lang}>
        {phrase.text}
      </p>
      {phrase.pronunciation && <p className="text-brand text-[15px] italic">{phrase.pronunciation}</p>}
      <p className="text-muted-foreground text-[14px]">{phrase.translation}</p>
      <Button
        size="sm"
        className="mt-1 h-10 self-start rounded-full px-4"
        onClick={() => void play()}
        aria-busy={state === "loading"}
      >
        {state === "loading" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <Volume2Icon className={cn("size-4", state === "playing" && "animate-pulse")} />}
        Decilo por mí
      </Button>
    </article>
  )
}

const Story: ComponentRenderer<Props<"Story">> = () => {
  const { data } = useEnv()
  const story = data.story
  if (!story || (story.facts.length === 0 && !story.anecdote)) return null
  return (
    <article className="bg-card flex flex-col gap-3 rounded-[22px] p-4">
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-wide uppercase">
        <BookOpenIcon className="size-3.5" />
        {story.subject}
      </span>
      {story.facts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {story.facts.map((fact, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
              <span className="bg-brand mt-[7px] size-1.5 shrink-0 rounded-full" />
              {fact}
            </li>
          ))}
        </ul>
      )}
      {story.anecdote && (
        <p className="border-brand/40 bg-muted/60 rounded-r-xl border-l-[3px] px-3 py-2 text-[14px] leading-snug italic">
          {story.anecdote}
        </p>
      )}
    </article>
  )
}

const SEEN_KIND: Record<NonNullable<GenUiData["seen"]>["kind"], string> = { lugar: "Estás frente a", obra: "Esto es", otro: "Esto es" }

const Seen: ComponentRenderer<Props<"Seen">> = () => {
  const { data, ask, addToPlan } = useEnv()
  const seen = data.seen
  const place = seen?.placeId ? (data.places[seen.placeId] ?? null) : null
  if (!seen) return null
  const photo = seen.photoUrl ?? place?.photoUrl ?? null
  return (
    <article className="bg-card overflow-hidden rounded-[22px]">
      {photo && (
        <div className="relative h-48">
          {/* La foto del viajero (blob:) o la de Google: <img> y no next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
            <CameraIcon className="size-3" />
            Tu foto
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1.5 p-3.5">
        <span className="text-muted-foreground text-[13px]">{SEEN_KIND[seen.kind]}</span>
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-[20px] leading-tight font-semibold">{seen.name}</h3>
            {seen.where && <span className="text-muted-foreground text-[13px]">En {seen.where}</span>}
            {place && <PlaceMeta place={place} walk={seen.kind !== "lugar"} />}
          </div>
          {place && <CategoryIcon category={place.category} className="size-10 shrink-0" />}
        </div>
        {seen.description && <p className="text-[14px] leading-snug">{seen.description}</p>}
        {/* Si estás frente al lugar, "Llevame" no tiene sentido: solo sumarlo al plan. */}
        {place && (
          <div className={cn("mt-1.5 grid gap-2", seen.kind === "lugar" ? "grid-cols-1" : "grid-cols-2")}>
            {seen.kind !== "lugar" && (
              <Button size="sm" className="h-9 rounded-full" onClick={() => ask(`Llevame a ${place.name}`, [place.id])}>
                <NavigationIcon className="size-3.5" />
                Llevame
              </Button>
            )}
            <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => addToPlan(place)}>
              <CalendarPlusIcon className="size-3.5" />
              Al plan
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada renderer tipa sus props; el registro los guarda juntos
const renderers: Record<GenUiComponentName, ComponentRenderer<any>> = {
  Screen,
  Say,
  PlaceHero,
  PlaceList,
  RouteMap,
  Compare,
  Stop,
  Timeline,
  Weather,
  Phrase,
  Story,
  Seen,
}

/** Biblioteca del cliente: mismos nombres y esquemas que el prompt del server. */
export const genUiLibrary = buildGenUiLibrary(renderers)
