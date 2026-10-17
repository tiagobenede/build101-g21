"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { saveTurn } from "@/app/talk/actions"
import { SESSION_BUDGET_USD, SESSION_IDLE_MS } from "@/lib/realtime/config"
import { connectRealtime, type RealtimeConnection, type RealtimeEvent } from "@/lib/realtime/connection"
import { estimateUsageCost, type RealtimeUsage } from "@/lib/realtime/cost"

import { useSpeechRecognition } from "./use-speech-recognition"
import type { RecommendationCard, Turn, VoiceSession, VoiceState } from "./voice-session-types"

const LANG = "es-ES"
const IDLE_CHECK_MS = 5_000
/** OpenAI rechaza commits de menos de 100 ms de audio. */
const MIN_SPEECH_MS = 300

export type KnownPlace = RecommendationCard

/** Tarjetas para los lugares que el agente nombró en su respuesta. */
function matchPlaces(text: string, places: KnownPlace[]): RecommendationCard[] {
  const lower = text.toLowerCase()
  return places.filter((p) => lower.includes(p.name.toLowerCase()))
}

/**
 * Sesión de voz real con OpenAI Realtime, en modo ahorro:
 * se conecta recién al primer uso, push-to-talk (solo se factura el audio mientras
 * hablás), sin transcripción paga (la hace el navegador), se cierra sola al quedar
 * inactiva o al pasar el presupuesto de la sesión.
 */
export function useRealtimeSession(places: KnownPlace[]): VoiceSession {
  const [state, setState] = useState<VoiceState>("idle")
  const [turns, setTurns] = useState<Turn[]>([])
  const [muted, setMutedState] = useState(false)
  const [costUsd, setCostUsd] = useState(0)

  const connRef = useRef<RealtimeConnection | null>(null)
  const connectingRef = useRef<Promise<RealtimeConnection | null> | null>(null)
  const agentTurnIdRef = useRef<string | null>(null)
  const userTurnIdRef = useRef<string | null>(null)
  const lastActivityRef = useRef(0)
  const listenStartedRef = useRef(0)
  const costRef = useRef(0)
  const inputVolumeRef = useRef(0)
  const outputVolumeRef = useRef(0)
  const placesRef = useRef(places)

  useEffect(() => {
    placesRef.current = places
  }, [places])

  const touch = () => {
    lastActivityRef.current = Date.now()
  }

  const updateTurn = useCallback((id: string, update: (turn: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? update(t) : t)))
  }, [])

  const disconnect = useCallback((reason?: string) => {
    connRef.current?.close()
    connRef.current = null
    agentTurnIdRef.current = null
    setState("idle")
    if (reason) toast.info(reason)
  }, [])

  // Texto del turno del agente en curso (para guardarlo sin efectos dentro de setState).
  const agentTextRef = useRef("")

  const finishAgentTurn = useCallback(
    (usage: RealtimeUsage | undefined) => {
      costRef.current += estimateUsageCost(usage)
      setCostUsd(costRef.current)

      const id = agentTurnIdRef.current
      const text = agentTextRef.current
      agentTurnIdRef.current = null
      agentTextRef.current = ""
      const conversationId = connRef.current?.conversationId
      if (id) {
        const recommendations = matchPlaces(text, placesRef.current)
        updateTurn(id, (t) => (t.role === "agent" ? { ...t, recommendations } : t))
        if (conversationId && text) void saveTurn({ conversationId, role: "agent", text })
      }

      if (costRef.current >= SESSION_BUDGET_USD) {
        disconnect(`Llegaste al tope de US$${SESSION_BUDGET_USD} de esta sesión. Cerré la voz para cuidar los créditos.`)
      }
    },
    [disconnect, updateTurn]
  )

  const handleEvent = useCallback(
    (ev: RealtimeEvent) => {
      if (process.env.NODE_ENV === "development") console.debug("[realtime]", ev.type, ev)
      touch()
      switch (ev.type) {
        case "response.created":
          setState("thinking")
          break
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta": {
          const delta = typeof ev.delta === "string" ? ev.delta : ""
          agentTextRef.current += delta
          if (!agentTurnIdRef.current) {
            const id = crypto.randomUUID()
            agentTurnIdRef.current = id
            setTurns((prev) => [...prev, { id, role: "agent", text: delta, recommendations: [] }])
          } else {
            updateTurn(agentTurnIdRef.current, (t) => ({ ...t, text: t.text + delta }))
          }
          break
        }
        case "output_audio_buffer.started":
          setState("talking")
          break
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          setState((s) => (s === "talking" ? "idle" : s))
          break
        case "response.done": {
          const response = ev.response as
            | { usage?: RealtimeUsage; status?: string; status_details?: { error?: { message?: string } } }
            | undefined
          if (response?.status === "failed") {
            const reason = response.status_details?.error?.message ?? "La respuesta falló."
            console.error("[realtime] response failed", JSON.stringify(response.status_details))
            toast.error(reason)
          }
          finishAgentTurn(response?.usage)
          // Si no hubo audio (cancelada o vacía), volvemos a idle acá.
          setState((s) => (s === "thinking" ? "idle" : s))
          break
        }
        case "error": {
          const message = (ev.error as { message?: string } | undefined)?.message ?? "Error de la sesión de voz."
          console.error("[realtime]", message)
          toast.error(message.includes("buffer too small") ? "No te escuché. Mantené el micrófono un poco más." : message)
          setState("idle")
          break
        }
      }
    },
    [finishAgentTurn, updateTurn]
  )

  const ensureConnected = useCallback(async (): Promise<RealtimeConnection | null> => {
    if (connRef.current) return connRef.current
    connectingRef.current ??= connectRealtime({
      onEvent: handleEvent,
      onDisconnect: () => disconnect(),
    })
      .then((conn) => {
        conn.setMuted(muted)
        connRef.current = conn
        touch()
        return conn
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "No se pudo conectar la voz.")
        return null
      })
      .finally(() => {
        connectingRef.current = null
      })
    return connectingRef.current
  }, [disconnect, handleEvent, muted])

  const recognition = useSpeechRecognition({
    lang: LANG,
    onFinal: (text) => {
      const id = userTurnIdRef.current
      userTurnIdRef.current = null
      if (!id) return
      const finalText = text || "🎙️ Mensaje de voz"
      updateTurn(id, (t) => ({ ...t, text: finalText }))
      const conversationId = connRef.current?.conversationId
      if (conversationId && text) void saveTurn({ conversationId, role: "user", text })
    },
  })

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

  // Cierre por inactividad y al salir de la página: nada queda abierto facturando.
  useEffect(() => {
    const timer = setInterval(() => {
      if (connRef.current && Date.now() - lastActivityRef.current > SESSION_IDLE_MS) {
        disconnect("Cerré la voz por inactividad. Tocá el micrófono para seguir.")
      }
    }, IDLE_CHECK_MS)
    const onPageHide = () => disconnect()
    window.addEventListener("pagehide", onPageHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
      connRef.current?.close()
      connRef.current = null
    }
  }, [disconnect])

  const cancelResponse = (conn: RealtimeConnection) => {
    conn.send({ type: "response.cancel" })
    conn.send({ type: "output_audio_buffer.clear" })
  }

  const listen = useCallback(async () => {
    setState("thinking")
    const conn = await ensureConnected()
    if (!conn) return setState("idle")
    if (!conn.hasMic) {
      toast.error("Necesito permiso de micrófono para escucharte. Mientras, podés escribir.")
      return setState("idle")
    }
    if (agentTurnIdRef.current) cancelResponse(conn)

    conn.send({ type: "input_audio_buffer.clear" })
    conn.setMicOpen(true)
    listenStartedRef.current = Date.now()
    touch()
    setState("listening")
    if (recognition.supported) recognition.start()
  }, [ensureConnected, recognition])

  const stopListening = useCallback(() => {
    const conn = connRef.current
    if (!conn) return
    conn.setMicOpen(false)
    recognition.stop()
    touch()

    if (Date.now() - listenStartedRef.current < MIN_SPEECH_MS) {
      conn.send({ type: "input_audio_buffer.clear" })
      recognition.abort()
      setState("idle")
      return
    }

    const id = crypto.randomUUID()
    userTurnIdRef.current = recognition.supported ? id : null
    setTurns((prev) => [...prev, { id, role: "user", text: recognition.interim || "🎙️ Mensaje de voz" }])
    conn.send({ type: "input_audio_buffer.commit" })
    conn.send({ type: "response.create" })
    setState("thinking")
  }, [recognition])

  const interrupt = useCallback(() => {
    const conn = connRef.current
    if (conn) {
      conn.setMicOpen(false)
      cancelResponse(conn)
    }
    recognition.abort()
    setState("idle")
  }, [recognition])

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text) return
      setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }])
      setState("thinking")
      const conn = await ensureConnected()
      if (!conn) return setState("idle")
      if (agentTurnIdRef.current) cancelResponse(conn)
      conn.send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      })
      conn.send({ type: "response.create" })
      void saveTurn({ conversationId: conn.conversationId, role: "user", text })
      touch()
    },
    [ensureConnected]
  )

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value)
    connRef.current?.setMuted(value)
  }, [])

  return {
    state,
    turns,
    revealed: Number.MAX_SAFE_INTEGER,
    interim: recognition.interim,
    muted,
    setMuted,
    inputVolumeRef,
    outputVolumeRef,
    costUsd,
    listen,
    stopListening,
    interrupt,
    send,
  }
}
