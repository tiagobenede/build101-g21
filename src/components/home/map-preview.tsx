"use client"

import { ChevronUpIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useState } from "react"

import { useLocation } from "@/components/location/location-provider"
import type { MapPlace, MapStop } from "@/components/location/map-view"
import { CategoryIcon } from "@/components/rumbo/category-icon"
import { Badge } from "@/components/ui/badge"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"

// Google Maps usa `window`: solo en el cliente.
const MapView = dynamic(() => import("@/components/location/map-view"), {
  ssr: false,
  loading: () => <div className="bg-muted size-full animate-pulse" />,
})

export type NearbyRow = {
  id: string
  name: string
  category: string
  walkMinutes: number
  forYou: boolean
}

interface MapPreviewProps {
  places: MapPlace[]
  stops: MapStop[]
  /** Ya ordenados: primero los que van con tus gustos, después por cercanía. */
  nearby: NearbyRow[]
}

const noop = () => undefined

/**
 * Mapa de la home a todo el ancho: dónde estás y qué hay cerca. Tocarlo abre el mapa
 * completo; el texto de abajo despliega la lista de lugares sin pasar por el agente.
 */
export function MapPreview({ places, stops, nearby }: MapPreviewProps) {
  const { position, heading } = useLocation()
  const [open, setOpen] = useState(false)
  const forYouCount = nearby.filter((p) => p.forYou).length

  return (
    <div className="relative h-[52dvh] max-h-[480px] min-h-64 w-full overflow-hidden">
      <MapView position={position} heading={heading} places={places} stops={stops} follow interactive={false} onTeleport={noop} onUserPan={noop} />
      <Link href="/map" aria-label="Abrir el mapa" className="absolute inset-0" />
      {/* Se funde con el fondo para que el texto se lea. */}
      <div className="from-background via-background/70 pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent" />
      {nearby.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute inset-x-0 bottom-3 mx-auto flex w-fit flex-col items-center gap-0.5 px-4 py-1 text-[15px] font-semibold"
        >
          <ChevronUpIcon className="text-muted-foreground size-4" />
          <span>
            {nearby.length} lugares cerca
            {forYouCount > 0 && forYouCount < nearby.length && <span className="text-brand"> · {forYouCount} para vos</span>}
          </span>
        </button>
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-xl">Cerca tuyo</DrawerTitle>
            <DrawerDescription>Primero lo que va con tus gustos.</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {nearby.map((place) => (
              <Item key={place.id} className="px-2 py-2.5">
                <ItemMedia>
                  <CategoryIcon category={place.category} />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="text-[15px]">{place.name}</ItemTitle>
                  <ItemDescription className="text-[13px]">
                    {place.category} · {place.walkMinutes} min a pie
                  </ItemDescription>
                </ItemContent>
                {place.forYou && (
                  <ItemActions>
                    <Badge className="bg-brand/10 text-brand rounded-full border-0">Para vos</Badge>
                  </ItemActions>
                )}
              </Item>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
