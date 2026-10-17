import type { RefObject } from "react"

export type CallState = "off" | "connecting" | "listening" | "thinking" | "talking"

export type PlaceCard = {
  id: string
  name: string
  category: string
  description: string | null
  walkMinutes: number
  stayMinutes: number
}

/** Lugar que el agente nombró durante la llamada. */
export type MentionedPlace = PlaceCard & { mentionedAt: number }

/** Llamada de voz en tiempo real que consume la UI. */
export interface VoiceCall {
  state: CallState
  /** Lugares que el agente fue nombrando, el más reciente primero. */
  places: MentionedPlace[]
  micMuted: boolean
  setMicMuted: (muted: boolean) => void
  speakerMuted: boolean
  setSpeakerMuted: (muted: boolean) => void
  inputVolumeRef: RefObject<number>
  outputVolumeRef: RefObject<number>
  /** Costo estimado en USD de la llamada. */
  costUsd: number
  start: () => Promise<void>
  /** Vacía los lugares de la charla anterior (volver a la pantalla con la llamada cortada). */
  clearPlaces: () => void
  end: () => void
  /** Le cuenta al agente algo que pasó en la pantalla (sin pedirle que responda). */
  /** Con `keep`, si la llamada no está abierta se manda al abrirla. */
  note: (text: string, options?: { keep?: boolean }) => void
}
