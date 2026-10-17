"use client"

import "@/lib/genui/no-devtools"

import type { ComponentRenderer } from "@openuidev/react-lang"
import { CalendarPlusIcon, CloudSunIcon, FootprintsIcon, LockIcon, NavigationIcon, StarIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { createContext, useContext, type ReactNode } from "react"

import { CategoryIcon, categoryColor } from "@/components/rumbo/category-icon"
import { Button } from "@/components/ui/button"
import { buildGenUiLibrary, type GenUiComponentName, type genUiSchemas } from "@/lib/genui/library"
import type { GenUiData, GenUiPlace } from "@/lib/genui/types"
import { formatDistance, distanceMeters } from "@/lib/geo"
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

function PlaceMeta({ place }: { place: GenUiPlace }) {
  return (
    <span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums">
      <span>{place.category}</span>
      <span className="inline-flex items-center gap-1">
        <FootprintsIcon className="size-3" />
        {place.walkMinutes} min
      </span>
      <span>~{place.visitMinutes} min de visita</span>
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
  if (!place) return null
  const color = categoryColor(place.category)
  return (
    <article className="bg-card overflow-hidden rounded-[22px]">
      <div
        className="relative flex h-24 items-end p-3"
        style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #1D1D1F))` }}
      >
        <CategoryIcon category={place.category} className="size-11 rounded-[12px] bg-white/20 backdrop-blur-md" />
        <span className="absolute top-3 right-3 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          Para vos
        </span>
      </div>
      <div className="flex flex-col gap-1.5 p-3.5">
        <h3 className="text-[17px] leading-tight font-semibold">{place.name}</h3>
        <PlaceMeta place={place} />
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
  const places = props.placeIds.map((id) => data.places[id]).filter((p): p is GenUiPlace => Boolean(p))
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
          <CategoryIcon category={p.category} className="size-8" />
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
  const { data } = useEnv()
  if (!place) return null
  return (
    <article className="bg-card overflow-hidden rounded-[22px]">
      <div className="relative h-44">
        <RouteMapView from={data.origin} to={place} category={place.category} />
        <div className="bg-card/95 absolute top-2.5 right-2.5 z-[1000] rounded-xl px-3 py-1.5 shadow-md backdrop-blur-md">
          <span className="block text-[17px] leading-tight font-semibold tabular-nums">{place.walkMinutes} min</span>
          <span className="text-muted-foreground text-[11px]">{formatDistance(distanceMeters(data.origin, place))} a pie</span>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3">
        <CategoryIcon category={place.category} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{place.name}</span>
          <span className="text-muted-foreground text-[13px]">Caminando, en línea recta en el mapa</span>
        </span>
      </div>
    </article>
  )
}

const Compare: ComponentRenderer<Props<"Compare">> = ({ props }) => {
  const { data } = useEnv()
  const places = props.placeIds.map((id) => data.places[id]).filter((p): p is GenUiPlace => Boolean(p))
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
}

/** Biblioteca del cliente: mismos nombres y esquemas que el prompt del server. */
export const genUiLibrary = buildGenUiLibrary(renderers)
