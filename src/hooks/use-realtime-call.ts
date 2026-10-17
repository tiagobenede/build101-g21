"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { saveTurn } from "@/app/talk/actions"
import { distanceMeters, type LatLng } from "@/lib/geo"
import { screenFromTool } from "@/lib/genui/screen-from-tool"
import type { GenUiRequest } from "@/lib/genui/types"
import { locationUpdateText, shouldAnnounce } from "@/lib/location/announce"
import {
  CONTEXT_REFRESH_CLOCK_MS,
  CONTEXT_REFRESH_DISTANCE_M,
  CONTEXT_REFRESH_MIN_MS,
  SESSION_BUDGET_USD,
  SESSION_IDLE_MS,
  TOOL_TIMEOUT_MS,
} from "@/lib/realtime/config"
import { connectRealtime, type RealtimeConnection, type RealtimeEvent } from "@/lib/realtime/connection"
import { estimateUsageCost, type RealtimeUsage } from "@/lib/realtime/cost"
import { findNewPlaces } from "@/lib/realtime/match-places"
import { ResponseQueue } from "@/lib/realtime/response-queue"
import type { ToolResult } from "@/lib/realtime/tools"
import { onTableChange } from "@/lib/supabase/client"

import type { CallState, MentionedPlace, PlaceCard, VoiceCall } from "./voice-session-types"

const IDLE_CHECK_MS = 5_000
const MAX_PENDING_NOTES = 3
/** Tablas que cambian lo que sabe el agente: si se tocan con la llamada abierta, se rearman las instrucciones. */
const CONTEXT_TABLES = ["itinerary_items", "profiles", "interests", "local_tips", "trip_members"] as const

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
export function useRealtimeCall(
  knownPlaces: PlaceCard[],
  location: LatLng | null = null,
  /** La pantalla: lugares del último tool del agente, o null para vaciarla. */
  onScreen?: (screen: GenUiRequest | null) => void
): VoiceCall {
  const [state, setState] = useState<CallState>("off")
  const [places, setPlaces] = useState<MentionedPlace[]>([])
  const [micMuted, setMicMutedState] = useState(false)
  const [speakerMuted, setSpeakerMutedState] = useState(false)
  const [costUsd, setCostUsd] = useState(0)

  const clearPlaces = useCallback(() => setPlaces([]), [])

  const connRef = useRef<RealtimeConnection | null>(null)
  const lastActivityRef = useRef(0)
  const costRef = useRef(0)
  const agentTextRef = useRef("")
  const seenRef = useRef(new Set<string>())
  const knownPlacesRef = useRef(knownPlaces)
  const inputVolumeRef = useRef(0)
  const outputVolumeRef = useRef(0)
  const queueRef = useRef<ResponseQueue | null>(null)
  const onScreenRef = useRef(onScreen)
  useEffect(() => {
    onScreenRef.current = onScreen
  }, [onScreen])
  /** Ubicación en vivo (joystick o GPS) y la última que se le avisó a la llamada. */
  const locationRef = useRef(location)
  const announcedRef = useRef<LatLng | null>(null)
  /** Ubicación con la que se armaron las instrucciones vigentes, y cuándo. */
  const contextAtRef = useRef<LatLng | null>(null)
  const contextRefreshedAtRef = useRef(0)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  /** Notas que esperan a que se abra la llamada (ej. la foto que sacó antes de hablar). */
  const pendingNotesRef = useRef<string[]>([])
  /** Lugares que devolvieron los tools: se muestran si el agente los nombra. */
  const toolPlacesRef = useRef<PlaceCard[]>([])

  useEffect(() => {
    knownPlacesRef.current = knownPlaces
  }, [knownPlaces])

  const touch = () => {
    lastActivityRef.current = Date.now()
  }

  const end = useCallback((reason?: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = null
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    connRef.current?.close()
    connRef.current = null
    queueRef.current = null
    setState("off")
    if (reason) toast.info(reason)
  }, [])

  const showPlaces = useCallback((cards: PlaceCard[]) => {
    const found = cards.filter((p) => !seenRef.current.has(p.id))
    if (found.length === 0) return
    found.forEach((p) => seenRef.current.add(p.id))
    const mentionedAt = Date.now()
    const mentioned = found.map((p) => ({ ...p, mentionedAt })).reverse()
    setPlaces((prev) => [...mentioned, ...prev])
  }, [])

  // Lugares que el agente nombra: los cercanos y los que trajo algún tool.
  const revealPlaces = useCallback(() => {
    const candidates = [...toolPlacesRef.current, ...knownPlacesRef.current]
    showPlaces(findNewPlaces(agentTextRef.current, candidates, seenRef.current))
  }, [showPlaces])

  /** Corre el tool en segundo plano; la cola decide cuándo entra el resultado a la charla. */
  const runToolCall = useCallback(
    async (ev: RealtimeEvent) => {
      const callId = typeof ev.call_id === "string" ? ev.call_id : null
      const conn = connRef.current
      const queue = queueRef.current
      if (!callId || !conn || !queue) return
      queue.begin(callId, typeof ev.response_id === "string" ? ev.response_id : "")

      const result: ToolResult = await fetch("/api/realtime/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ev.name,
          arguments: ev.arguments,
          conversationId: conn.conversationId,
          location: locationRef.current,
        }),
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      })
        .then((res) => (res.ok ? (res.json() as Promise<ToolResult>) : Promise.reject(new Error(String(res.status)))))
        .catch((err: unknown) => {
          console.error("[realtime] tool failed", ev.name, err)
          return { output: JSON.stringify({ error: "No pude buscar eso ahora." }), cards: [] }
        })

      // Si la llamada se cortó mientras corría el tool, la cola ya no es la misma.
      if (queueRef.current !== queue) return
      touch()

      // Un solo agente: la pantalla cambia en el mismo momento en que el resultado entra a la
      // conversación, con exactamente esos lugares (o se vacía si no encontró nada).
      const screen = screenFromTool(ev.name, ev.arguments, result.cards)
      queue.resolve(callId, result.output, () => {
        toolPlacesRef.current = [...result.cards, ...toolPlacesRef.current]
        showPlaces(result.cards.slice(0, 1))
        if (screen.kind === "show") onScreenRef.current?.({ request: screen.request, placeIds: screen.placeIds })
        if (screen.kind === "clear") onScreenRef.current?.(null)
      })
    },
    [showPlaces]
  )

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
      queueRef.current?.handle(ev)
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
        case "response.function_call_arguments.done":
          touch()
          void runToolCall(ev)
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
          // Con un tool corriendo seguimos "pensando" hasta que llegue su respuesta.
          setState((s) => (s === "thinking" && !queueRef.current?.hasPending ? "listening" : s))
          break
        case "error": {
          const message = (ev.error as { message?: string } | undefined)?.message ?? "Error en la llamada."
          console.error("[realtime]", message)
          toast.error(message)
          break
        }
      }
    },
    [finishResponse, revealPlaces, runToolCall]
  )

  /**
   * Rearma las instrucciones en el server (ubicación en vivo, plan de ahora) y las
   * manda con `session.update`. No pide respuesta: no genera audio.
   */
  const refreshContext = useCallback(async () => {
    const conn = connRef.current
    if (!conn) return
    contextRefreshedAtRef.current = Date.now()
    contextAtRef.current = locationRef.current
    try {
      const res = await fetch("/api/realtime/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: locationRef.current }),
      })
      const { instructions } = (await res.json()) as { instructions?: string }
      if (!instructions || connRef.current !== conn) return
      conn.send({ type: "session.update", session: { type: "realtime", instructions } })
    } catch (err) {
      console.error("[realtime] refresh context failed", err)
    }
  }, [])

  /** Refresca ya si pasó el mínimo; si no, una sola vez cuando se cumpla. */
  const scheduleRefresh = useCallback(
    (delayMs = 0) => {
      if (refreshTimerRef.current) return
      const wait = Math.max(delayMs, contextRefreshedAtRef.current + CONTEXT_REFRESH_MIN_MS - Date.now())
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        void refreshContext()
      }, wait)
    },
    [refreshContext]
  )

  const start = useCallback(async () => {
    if (connRef.current) return
    setState("connecting")
    queueRef.current = new ResponseQueue((event) => connRef.current?.send(event))
    try {
      const conn = await connectRealtime({
        onEvent: handleEvent,
        onDisconnect: () => end(),
        location: locationRef.current,
      })
      connRef.current = conn
      announcedRef.current = locationRef.current
      contextAtRef.current = locationRef.current
      contextRefreshedAtRef.current = Date.now()
      // Cambios del itinerario o del perfil (de la app, del agente o de otro dispositivo) → refrescar el contexto.
      void Promise.all(CONTEXT_TABLES.map((table) => onTableChange(table, () => scheduleRefresh(2_000)))).then(
        (unsubscribes) => {
          const unsubscribe = () => unsubscribes.forEach((u) => u())
          // Si la llamada se cortó mientras nos suscribíamos, soltamos los canales ya.
          if (connRef.current === conn) unsubscribeRef.current = unsubscribe
          else unsubscribe()
        }
      )
      conn.setMicOpen(!micMuted)
      conn.setMuted(speakerMuted)
      // Lo que pasó antes de llamar entra antes del saludo, así puede mencionarlo.
      for (const text of pendingNotesRef.current.splice(0)) {
        conn.send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } })
      }
      conn.send({
        type: "conversation.item.create",
        // Mensaje de sistema y no `response.instructions`: esas reemplazan las de la sesión
        // y el agente saludaba sin saber nada del viajero.
        item: { type: "message", role: "system", content: [{ type: "input_text", text: conn.greeting }] },
      })
      conn.send({ type: "response.create" })
      touch()
      setState("thinking")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar la voz.")
      setState("off")
    }
  }, [end, handleEvent, micMuted, scheduleRefresh, speakerMuted])

  // Si te movés con la llamada abierta, se lo contamos al agente con un mensaje de sistema.
  // No pide respuesta (no cuesta audio): el próximo recommend_nearby ya usa la ubicación nueva.
  useEffect(() => {
    locationRef.current = location
    const conn = connRef.current
    const announced = announcedRef.current
    if (!conn || !location || !announced || !shouldAnnounce(announced, location)) return
    announcedRef.current = location
    conn.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text: locationUpdateText(announced, location) }] },
    })
  }, [location])

  // Lejos de donde se armaron las instrucciones: la lista de cercanos ya no sirve, se rearma.
  useEffect(() => {
    const at = contextAtRef.current
    if (!connRef.current || !location || !at) return
    if (distanceMeters(at, location) >= CONTEXT_REFRESH_DISTANCE_M) scheduleRefresh()
  }, [location, scheduleRefresh])

  // Llamada larga sin moverse: se rearma igual para que la hora siga al día.
  useEffect(() => {
    const timer = setInterval(() => {
      if (connRef.current && Date.now() - contextRefreshedAtRef.current >= CONTEXT_REFRESH_CLOCK_MS) scheduleRefresh()
    }, 60_000)
    return () => clearInterval(timer)
  }, [scheduleRefresh])

  // Solo en desarrollo: hablarle al agente por texto, sin micrófono (window.rumboSay("llevame")).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const w = window as unknown as { rumboSay?: (text: string) => void }
    w.rumboSay = (text) => {
      const conn = connRef.current
      if (!conn) return console.warn("[rumboSay] la llamada no está abierta")
      conn.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } })
      conn.send({ type: "response.create" })
    }
    return () => {
      delete w.rumboSay
    }
  }, [])

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
      // Un tool en curso cuenta como actividad: no cortamos mientras busca.
      if (queueRef.current?.hasPending) touch()
      if (connRef.current && Date.now() - lastActivityRef.current > SESSION_IDLE_MS) {
        end("Corté la llamada porque no hablamos en un rato.")
      }
    }, IDLE_CHECK_MS)
    const onPageHide = () => end()
    window.addEventListener("pagehide", onPageHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener("pagehide", onPageHide)
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      unsubscribeRef.current?.()
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

  /** Nota de sistema para el agente. Con `keep`, si la llamada no está abierta se manda al abrirla. */
  const note = useCallback((text: string, { keep = false }: { keep?: boolean } = {}) => {
    const conn = connRef.current
    if (!conn) {
      if (keep) pendingNotesRef.current = [...pendingNotesRef.current, text].slice(-MAX_PENDING_NOTES)
      return
    }
    conn.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
    })
  }, [])

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
    clearPlaces,
    end: hangUp,
    note,
  }
}
