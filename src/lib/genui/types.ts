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
  /** Foto principal de Google (vía /api/places/photo), o null. */
  photoUrl: string | null
  /** De Google Place Details; null si no se sabe (lugares sin id de Google). */
  openNow: boolean | null
  hoursToday: string | null
  /** Hora de cierre del tramo de ahora ("18:00") y cuánto falta. null si no abre o no se sabe. */
  closesAt: string | null
  closesInMinutes: number | null
}

/** Datos de guía de place_facts, para contarlos también en pantalla. */
export type GenUiStory = { subject: string; facts: string[]; anecdote: string | null }

/** Lo que reconoció la cámara. */
export type GenUiSeen = {
  name: string
  kind: "lugar" | "obra" | "otro"
  where: string | null
  description: string | null
  /** El lugar de `places`, si se pudo ubicar (para "Al plan" y "Llevame"). */
  placeId: string | null
  /** La foto que sacó el viajero (blob: del navegador; nunca va al server). */
  photoUrl?: string | null
}

/** Una frase para decirle a alguien del lugar. */
export type GenUiPhrase = {
  /** En el idioma local: "Bonjour, un croissant s'il vous plaît." */
  text: string
  translation: string
  /** Cómo se lee, para un hispanohablante: "bonyúr, an cruasán sil vu plé". */
  pronunciation: string | null
  /** BCP 47, para leerla en voz alta: "fr-FR". */
  lang: string
}

/** Datos que acompañan a una pantalla generada: los componentes buscan acá por id. */
export type GenUiData = {
  origin: LatLng
  places: Record<string, GenUiPlace>
  weather: string | null
  /** Títulos del itinerario de hoy (para marcar paradas fijas en un Timeline). */
  itineraryTitles: string[]
  story: GenUiStory | null
  seen: GenUiSeen | null
  phrase: GenUiPhrase | null
}

/** Lo que pide la llamada de voz (tool show_ui o resultado de una recomendación). */
export type GenUiRequest = {
  /** Qué mostrar, en palabras del agente: "ruta al Picasso", "compará estos cafés". */
  request: string
  placeIds: string[]
  story?: GenUiStory | null
  seen?: GenUiSeen | null
  phrase?: GenUiPhrase | null
}

/** Primera línea del stream: los datos; después, OpenUI Lang. */
export const GENUI_DATA_PREFIX = "DATA:"
