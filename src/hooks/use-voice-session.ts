"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { sendMessage, startConversation, type AgentTurn } from "@/app/talk/actions"

import { useMicVolume } from "./use-mic-volume"
import { useSpeechRecognition } from "./use-speech-recognition"
import { useSpeechSynthesis } from "./use-speech-synthesis"

export type VoiceState = "idle" | "listening" | "thinking" | "talking"

export type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; text: string; recommendations: AgentTurn["recommendations"] }

const LANG = "es-ES"
const MIN_THINKING_MS = 700

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Sesión de voz simulada: micrófono + dictado del navegador + respuesta del
 * backend + voz del navegador. Mismo shape que tendrá la sesión real con
 * ElevenLabs (state, volúmenes, transcript), para cambiarla sin tocar la UI.
 */
export function useVoiceSession() {
  const [state, setState] = useState<VoiceState>("idle")
  const [turns, setTurns] = useState<Turn[]>([])
  const [revealed, setRevealed] = useState(0)
  const [muted, setMuted] = useState(false)
  const conversationIdRef = useRef<string | null>(null)
  const busyRef = useRef(false)

  const mic = useMicVolume()
  const voice = useSpeechSynthesis(LANG)

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current
    const res = await startConversation()
    if (!res.ok) {
      toast.error(res.error)
      return null
    }
    conversationIdRef.current = res.data.id
    return res.data.id
  }, [])

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || busyRef.current) return
      busyRef.current = true
      voice.cancel()
      mic.stop()

      setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }])
      setState("thinking")

      try {
        const conversationId = await ensureConversation()
        if (!conversationId) return setState("idle")

        const [res] = await Promise.all([sendMessage({ conversationId, text }), wait(MIN_THINKING_MS)])
        if (!res.ok) {
          toast.error(res.error)
          return setState("idle")
        }

        setRevealed(0)
        setTurns((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "agent", text: res.data.text, recommendations: res.data.recommendations },
        ])
        setState("talking")
        voice.speak(
          res.data.text,
          { onProgress: setRevealed, onEnd: () => setState((s) => (s === "talking" ? "idle" : s)) },
          { muted }
        )
      } catch {
        toast.error("Se cortó la conexión con Rumbo. Probá de nuevo.")
        setState("idle")
      } finally {
        busyRef.current = false
      }
    },
    [ensureConversation, mic, muted, voice]
  )

  const recognition = useSpeechRecognition({
    lang: LANG,
    onFinal: (text) => {
      mic.stop()
      if (text) void send(text)
      else setState((s) => (s === "listening" ? "idle" : s))
    },
  })

  const listen = useCallback(async () => {
    if (!recognition.supported) {
      toast.info("Tu navegador no soporta dictado. Usá Chrome o escribí tu pregunta.")
      return
    }
    voice.cancel()
    setRevealed(Number.MAX_SAFE_INTEGER)
    const micOk = await mic.start()
    if (!micOk) {
      toast.error("Necesito permiso de micrófono para escucharte.")
      return
    }
    setState("listening")
    recognition.start()
  }, [mic, recognition, voice])

  const stopListening = useCallback(() => recognition.stop(), [recognition])

  const interrupt = useCallback(() => {
    voice.cancel()
    recognition.abort()
    mic.stop()
    setRevealed(Number.MAX_SAFE_INTEGER)
    setState("idle")
  }, [mic, recognition, voice])

  return {
    state,
    turns,
    revealed,
    interim: recognition.interim,
    muted,
    setMuted,
    inputVolumeRef: mic.volumeRef,
    outputVolumeRef: voice.outputVolumeRef,
    listen,
    stopListening,
    interrupt,
    send,
  }
}
