"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { FINISH_NOTE, MAX_ANSWERS_PER_QUESTION, nextQuestionNote } from "@/lib/onboarding/instructions"
import { ONBOARDING_QUESTIONS } from "@/lib/onboarding/questions"
import type { TranscriptTurn } from "@/lib/onboarding/schema"
import { advanceQuestion, applyCapture, INITIAL_ONBOARDING, type OnboardingState } from "@/lib/onboarding/state"
import { connectRealtime, type RealtimeConnection, type RealtimeEvent } from "@/lib/realtime/connection"

import type { CallState } from "./voice-session-types"

/** Tope de la charla: nada queda abierto facturando si se olvidan la pestaña. */
const MAX_CALL_MS = 8 * 60_000
/** Si el cierre del agente no termina de sonar, se pasa igual al resumen. */
const CLOSING_FALLBACK_MS = 10_000
const MAX_TRANSCRIPT_CHARS = 600

const EMPTY_CAPTURE = { insights: [], pace: null, schedule: null, daily_budget: null, mobility: null }

type ToolOutput = { callId: string; output: string }

/** Lo que queda al terminar: el estado (pregunta, burbujas) y la charla transcripta. */
export type OnboardingEnd = { state: OnboardingState; transcript: TranscriptTurn[] }

export interface OnboardingCall {
  state: CallState
  onboarding: OnboardingState
  inputVolumeRef: React.RefObject<number>
  outputVolumeRef: React.RefObject<number>
  /** Abre la llamada (mic cerrado, sin hablar todavía). */
  connect: () => Promise<boolean>
  /** El blob ya está en pantalla: saluda y hace la primera pregunta. */
  begin: () => void
  hangUp: () => void
  /** Lo charlado hasta ahora (para saltear y armar el resumen igual). */
  snapshot: () => OnboardingEnd
}

const systemItem = (text: string): RealtimeEvent => ({
  type: "conversation.item.create",
  item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
})

/**
 * Llamada del onboarding por voz. El agente solo conversa (respuestas cortas, sin tools
 * pesados); el navegador pide cada respuesta y, tras 2 respuestas del viajero, pasa solo a la
 * siguiente pregunta. Las burbujas y el resumen salen de la transcripción con un modelo de texto.
 */
export function useOnboardingCall(onFinished: (end: OnboardingEnd) => void): OnboardingCall {
  const [state, setState] = useState<CallState>("off")
  const [onboarding, setOnboarding] = useState<OnboardingState>(INITIAL_ONBOARDING)

  const connRef = useRef<RealtimeConnection | null>(null)
  const onboardingRef = useRef<OnboardingState>(INITIAL_ONBOARDING)
  const transcriptRef = useRef<TranscriptTurn[]>([])
  /** En qué pregunta se dijo cada respuesta (la transcripción llega después). */
  const questionByItemRef = useRef(new Map<string, number>())
  const answersRef = useRef(0)
  /** El navegador ya pasó de pregunta en este turno: un next_question del agente no vuelve a pasar. */
  const advancedThisTurnRef = useRef(false)
  const outputsRef = useRef<ToolOutput[]>([])
  const closingRef = useRef(false)
  const seqRef = useRef(0)
  const inputVolumeRef = useRef(0)
  const outputVolumeRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  const update = (next: OnboardingState) => {
    onboardingRef.current = next
    setOnboarding(next)
  }

  const snapshot = useCallback((): OnboardingEnd => ({ state: onboardingRef.current, transcript: transcriptRef.current }), [])

  const close = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    connRef.current?.close()
    connRef.current = null
    setState("off")
  }, [])

  const finish = useCallback(() => {
    // Una sola vez: el cierre puede llegar por el audio, el corte o el tope de tiempo.
    if (!connRef.current) return
    close()
    onFinishedRef.current(snapshot())
  }, [close, snapshot])

  const addTurn = (turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn]
  }

  /** Pasa a la siguiente pregunta (o al cierre). Devuelve lo que lee el agente. */
  const advance = useCallback((): string => {
    const next = advanceQuestion(onboardingRef.current)
    update(next.state)
    answersRef.current = 0
    if (next.state.done && !closingRef.current) {
      closingRef.current = true
      timersRef.current.push(setTimeout(finish, CLOSING_FALLBACK_MS))
    }
    return next.output
  }, [finish])

  /** Burbujas: palabras clave de la respuesta, sin frenar la charla. */
  const fetchKeywords = useCallback((question: number, text: string) => {
    void fetch("/api/onboarding/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, text }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ keywords?: string[] }>) : { keywords: [] }))
      .then(({ keywords = [] }) => {
        if (keywords.length === 0) return
        seqRef.current += 1
        update(applyCapture(onboardingRef.current, { keywords, ...EMPTY_CAPTURE }, seqRef.current))
      })
      .catch((err: unknown) => console.error("[onboarding] keywords", err))
  }, [])

  /** El viajero terminó de hablar: el navegador decide si sigue la pregunta o pasa a la próxima. */
  const onUserTurn = useCallback(
    (itemId: string | null) => {
      const conn = connRef.current
      if (!conn || closingRef.current) return
      if (itemId) questionByItemRef.current.set(itemId, onboardingRef.current.question)
      answersRef.current += 1
      advancedThisTurnRef.current = false
      if (answersRef.current >= MAX_ANSWERS_PER_QUESTION) {
        advance()
        advancedThisTurnRef.current = true
        const { done, question } = onboardingRef.current
        conn.send(systemItem(done ? FINISH_NOTE : nextQuestionNote(ONBOARDING_QUESTIONS[question - 1].title)))
      }
      conn.send({ type: "response.create" })
      setState("thinking")
    },
    [advance]
  )

  const handleEvent = useCallback(
    (ev: RealtimeEvent) => {
      const conn = connRef.current
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          setState("listening")
          break
        case "input_audio_buffer.committed":
          onUserTurn(typeof ev.item_id === "string" ? ev.item_id : null)
          break
        case "conversation.item.input_audio_transcription.completed": {
          const text = typeof ev.transcript === "string" ? ev.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : ""
          if (!text) break
          const itemId = typeof ev.item_id === "string" ? ev.item_id : ""
          const question = questionByItemRef.current.get(itemId) ?? onboardingRef.current.question
          addTurn({ question, role: "user", text })
          fetchKeywords(question, text)
          break
        }
        case "response.output_audio_transcript.done": {
          const text = typeof ev.transcript === "string" ? ev.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : ""
          if (text) addTurn({ question: onboardingRef.current.question, role: "agent", text })
          break
        }
        case "response.function_call_arguments.done": {
          const callId = typeof ev.call_id === "string" ? ev.call_id : null
          if (!callId) break
          let output = JSON.stringify({ error: "Tool desconocido." })
          if (ev.name === "next_question") {
            // Si el navegador ya pasó en este turno, no se saltea otra pregunta.
            output = advancedThisTurnRef.current ? JSON.stringify({ ok: true }) : advance()
            advancedThisTurnRef.current = true
          }
          outputsRef.current = [...outputsRef.current, { callId, output }]
          break
        }
        case "response.done": {
          const response = ev.response as { status?: string; status_details?: { error?: { message?: string } } } | undefined
          if (response?.status === "failed") toast.error(response.status_details?.error?.message ?? "La respuesta falló.")
          // Las respuestas de los tools entran cuando terminó el turno, y el agente sigue hablando.
          const outputs = outputsRef.current
          outputsRef.current = []
          if (conn && outputs.length > 0) {
            for (const { callId, output } of outputs) {
              conn.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } })
            }
            conn.send({ type: "response.create" })
            setState("thinking")
          } else {
            setState((s) => (s === "thinking" ? "listening" : s))
          }
          break
        }
        case "output_audio_buffer.started":
          setState("talking")
          break
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          // Terminó de decir el cierre: al resumen.
          if (closingRef.current && outputsRef.current.length === 0) finish()
          else setState((s) => (s === "talking" ? "listening" : s))
          break
        case "error": {
          const message = (ev.error as { message?: string } | undefined)?.message ?? "Error en la llamada."
          console.error("[onboarding]", message)
          break
        }
      }
    },
    [advance, fetchKeywords, finish, onUserTurn]
  )

  const connect = useCallback(async () => {
    if (connRef.current) return true
    setState("connecting")
    try {
      const conn = await connectRealtime({
        onEvent: handleEvent,
        onDisconnect: () => finish(),
        location: null,
        sessionUrl: "/api/realtime/onboarding",
      })
      connRef.current = conn
      timersRef.current.push(setTimeout(finish, MAX_CALL_MS))
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar la voz.")
      setState("off")
      return false
    }
  }, [finish, handleEvent])

  const begin = useCallback(() => {
    const conn = connRef.current
    if (!conn) return
    conn.setMicOpen(true)
    conn.send(systemItem(conn.greeting))
    conn.send({ type: "response.create" })
    setState("thinking")
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

  // Al salir de la página, se corta.
  useEffect(() => {
    window.addEventListener("pagehide", close)
    return () => {
      window.removeEventListener("pagehide", close)
      close()
    }
  }, [close])

  // Solo en desarrollo: contestarle por texto, sin micrófono (window.rumboSay("me encantan los autos")).
  // Pasa por el mismo camino que una respuesta hablada (cuenta para avanzar y para el resumen).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const w = window as unknown as { rumboSay?: (text: string) => void }
    w.rumboSay = (text) => {
      const conn = connRef.current
      if (!conn) return console.warn("[rumboSay] la llamada no está abierta")
      const question = onboardingRef.current.question
      conn.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } })
      addTurn({ question, role: "user", text })
      fetchKeywords(question, text)
      onUserTurn(null)
    }
    return () => {
      delete w.rumboSay
    }
  }, [fetchKeywords, onUserTurn])

  return { state, onboarding, inputVolumeRef, outputVolumeRef, connect, begin, hangUp: close, snapshot }
}
