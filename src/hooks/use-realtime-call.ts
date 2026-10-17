"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { saveTurn } from "@/app/talk/actions"
import { SESSION_BUDGET_USD, SESSION_IDLE_MS } from "@/lib/realtime/config"
import { connectRealtime, type RealtimeConnection, type RealtimeEvent } from "@/lib/realtime/connection"
import { estimateUsageCost, type RealtimeUsage } from "@/lib/realtime/cost"
import { findNewPlaces } from "@/lib/realtime/match-places"

import type { CallState, MentionedPlace, PlaceCard, VoiceCall } from "./voice-session-types"

const IDLE_CHECK_MS = 5_000
const GREETING = "Saludá en una frase corta por el nombre y preguntá cuánto tiempo tiene."

type ResponseDone = {
  usage?: RealtimeUsage
  status?: string
  status_details?: { error?: { message?: string } }
}

/**
 * Llamada de voz full-duplex con OpenAI Realtime: hablás cuando quieras, el
 * servidor detecta los turnos y si lo interrumpís se calla. La transcripción no
 * se muestra; solo se usa para sacar las tarjetas de los lugares que nombra.
 *
 * Ahorro: modelo mini, respuestas cortas, solo se factura la voz detectada,
 * se corta sola tras 1 min sin actividad, al salir o al pasar el presupuesto.
 */
export function useRealtimeCall(knownPlaces: PlaceCard[]): VoiceCall {
  const [state, setState] = useState<CallState>("off")
  const [places, setPlaces] = useState<MentionedPlace[]>([])
  const [micMuted, setMicMutedState] = useState(false)
  const [speakerMuted, setSpeakerMutedState] = useState(false)
  const [costUsd, setCostUsd] = useState(0)

  const connRef = useRef<RealtimeConnection | null>(null)
  const lastActivityRef = useRef(0)
  const costRef = useRef(0)
  const agentTextRef = useRef("")
  const seenRef = useRef(new Set<string>())
  const knownPlacesRef = useRef(knownPlaces)
  const inputVolumeRef = useRef(0)
  const outputVolumeRef = useRef(0)

  useEffect(() => {
    knownPlacesRef.current = knownPlaces
  }, [knownPlaces])

  const touch = () => {
    lastActivityRef.current = Date.now()
  }

  const end = useCallback((reason?: string) => {
    connRef.current?.close()
    connRef.current = null
    setState("off")
    if (reason) toast.info(reason)
  }, [])

  const revealPlaces = useCallback(() => {
    const found = findNewPlaces(agentTextRef.current, knownPlacesRef.current, seenRef.current)
    if (found.length === 0) return
    found.forEach((p) => seenRef.current.add(p.id))
    const mentionedAt = Date.now()
    const mentioned = found.map((p) => ({ ...p, mentionedAt })).reverse()
    setPlaces((prev) => [...mentioned, ...prev])
  }, [])

  const finishResponse = useCallback(
    (response: ResponseDone | undefined) => {
      if (response?.status === "failed") {
        toast.error(response.status_details?.error?.message ?? "La respuesta falló.")
      }
      costRef.current += estimateUsageCost(response?.usage)
      setCostUsd(costRef.current)

      const text = agentTextRef.current.trim()
      agentTextRef.current = ""
      const conversationId = connRef.current?.conversationId
      if (conversationId && text) void saveTurn({ conversationId, role: "agent", text })

      if (costRef.current >= SESSION_BUDGET_USD) {
        end(`Llegaste al tope de US$${SESSION_BUDGET_USD} de esta llamada. La corté para cuidar los créditos.`)
      }
    },
    [end]
  )

  const handleEvent = useCallback(
    (ev: RealtimeEvent) => {
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          touch()
          setState("listening")
          break
        case "input_audio_buffer.speech_stopped":
          touch()
          setState("thinking")
          break
        case "response.output_audio_transcript.delta":
          agentTextRef.current += typeof ev.delta === "string" ? ev.delta : ""
          revealPlaces()
          break
        case "output_audio_buffer.started":
          touch()
          setState("talking")
          break
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          touch()
          setState((s) => (s === "talking" ? "listening" : s))
          break
        case "response.done":
          touch()
          finishResponse(ev.response as ResponseDone | undefined)
          setState((s) => (s === "thinking" ? "listening" : s))
          break
        case "error": {
          const message = (ev.error as { message?: string } | undefined)?.message ?? "Error en la llamada."
          console.error("[realtime]", message)
          toast.error(message)
          break
        }
      }
    },
    [finishResponse, revealPlaces]
  )

  const start = useCallback(async () => {
    if (connRef.current) return
    setState("connecting")
    try {
      const conn = await connectRealtime({ onEvent: handleEvent, onDisconnect: () => end() })
      connRef.current = conn
      conn.setMicOpen(!micMuted)
      conn.setMuted(speakerMuted)
      conn.send({ type: "response.create", response: { instructions: GREETING } })
      touch()
      setState("thinking")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar la voz.")
      setState("off")
    }
  }, [end, handleEvent, micMuted, speakerMuted])

  // Volúmenes para el blob, por frame.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      inputVolumeRef.current = connRef.current?.inputVolume() ?? 0
      outputVolumeRef.current = connRef.current?.outputVolume() ?? 0
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Corte por inactividad y al salir de la página: nada queda abierto facturando.
  useEffect(() => {
    const timer = setInterval(() => {
      if (connRef.current && Date.now() - lastActivityRef.current > SESSION_IDLE_MS) {
        end("Corté la llamada porque no hablamos en un rato.")
      }
    }, IDLE_CHECK_MS)
    const onPageHide = () => end()
    window.addEventListener("pagehide", onPageHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
      connRef.current?.close()
      connRef.current = null
    }
  }, [end])

  const setMicMuted = useCallback((muted: boolean) => {
    setMicMutedState(muted)
    connRef.current?.setMicOpen(!muted)
  }, [])

  const setSpeakerMuted = useCallback((muted: boolean) => {
    setSpeakerMutedState(muted)
    connRef.current?.setMuted(muted)
  }, [])

  const hangUp = useCallback(() => end(), [end])

  return {
    state,
    places,
    micMuted,
    setMicMuted,
    speakerMuted,
    setSpeakerMuted,
    inputVolumeRef,
    outputVolumeRef,
    costUsd,
    start,
    end: hangUp,
  }
}
