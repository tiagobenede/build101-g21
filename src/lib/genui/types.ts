import type { LatLng } from "@/lib/geo"

/** Lugar con todo lo que necesitan los componentes generativos (lo calcula el server). */
export type GenUiPlace = {
  id: string
  name: string
  category: string
  tags: string[]
  description: string | null
  rating: number | null
  walkMinutes: number
  visitMinutes: number
  lat: number
  lng: number
}

/** Datos que acompañan a una pantalla generada: los componentes buscan acá por id. */
export type GenUiData = {
  origin: LatLng
  places: Record<string, GenUiPlace>
  weather: string | null
  /** Títulos del itinerario de hoy (para marcar paradas fijas en un Timeline). */
  itineraryTitles: string[]
}

/** Lo que pide la llamada de voz (tool show_ui o resultado de una recomendación). */
export type GenUiRequest = {
  /** Qué mostrar, en palabras del agente: "ruta al Picasso", "compará estos cafés". */
  request: string
  placeIds: string[]
}

/** Primera línea del stream: los datos; después, OpenUI Lang. */
export const GENUI_DATA_PREFIX = "DATA:"
