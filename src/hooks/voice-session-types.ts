import type { RefObject } from "react"

export type VoiceState = "idle" | "listening" | "thinking" | "talking"

export type RecommendationCard = {
  id: string
  name: string
  category: string
  walkMinutes: number
  stayMinutes: number
}

export type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; text: string; recommendations: RecommendationCard[] }

/** Contrato común de la sesión de voz (simulada o real) que consume la UI. */
export interface VoiceSession {
  state: VoiceState
  turns: Turn[]
  /** Caracteres revelados del último turno del agente (karaoke). */
  revealed: number
  interim: string
  muted: boolean
  setMuted: (muted: boolean) => void
  inputVolumeRef: RefObject<number>
  outputVolumeRef: RefObject<number>
  /** Costo estimado en USD de la sesión (null si es gratis). */
  costUsd: number | null
  listen: () => Promise<void>
  stopListening: () => void
  interrupt: () => void
  send: (text: string) => Promise<void>
}
