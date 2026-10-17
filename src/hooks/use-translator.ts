"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { LatLng } from "@/lib/geo"
import {
  ACTIVE_MAX_MS,
  FLUSH_MAX_MS,
  FLUSH_QUIET_MS,
  TRANSLATE_USD_PER_MINUTE,
  type Lang,
  type Speaker,
} from "@/lib/translate/config"
import { connectTranslation, type TranslationConnection } from "@/lib/translate/connection"
import { UtteranceBuilder, type Utterance } from "@/lib/translate/utterances"

/** off: sin mic · ready: mic listo, nada abierto (no cobra) · connecting · listening · finishing: termina de traducir. */
export type TranslatorState = "off" | "ready" | "connecting" | "listening" | "finishing"

type Direction = {
  speaker: Speaker
  track: MediaStreamTrack
  conn: TranslationConnection | null
  builder: UtteranceBuilder
  openedAt: number
  lastOutputAt: number
  releasing: boolean
  closed: boolean
}

const TICK_MS = 250
/** Turnos que se pasan con cada uno nuevo, para entender a qué responde. */
const RECENT_TURNS = 4

type SessionResponse = { success: true; data: { key: string; conversationId: string } } | { success: false; error: string }

/**
 * Traductor cara a cara. Una sesión por vez y solo mientras alguien habla: apretar
 * "hablo yo" abre la dirección mía → su idioma; soltarla (o cambiar de quien habla)
 * deja terminar la traducción y cierra la sesión, porque se cobra cada minuto abierto.
 */
export function useTranslator({
  myLang,
  theirLang,
  location,
  onTurn,
}: {
  myLang: Lang
  theirLang: Lang
  location: LatLng | null
  /** Cada turno terminado, con los anteriores (el último es este) y la conversación. */
  onTurn?: (turn: Utterance, recent: Utterance[], conversationId: string) => void
}) {
  const [state, setState] = useState<TranslatorState>("off")
  const [speaker, setSpeaker] = useState<Speaker | null>(null)
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [spentUsd, setSpentUsd] = useState(0)

  const micRef = useRef<MediaStream | null>(null)
  const activeRef = useRef<Direction | null>(null)
  const openRef = useRef(new Set<Direction>())
  const conversationRef = useRef<string | null>(null)
  const billedMsRef = useRef(0)
  const langsRef = useRef({ myLang, theirLang, location })
  const onTurnRef = useRef(onTurn)
  const turnsRef = useRef<Utterance[]>([])
  /** Frases que se están guardando: el resumen al cerrar tiene que verlas. */
  const savingRef = useRef(new Set<Promise<unknown>>())
  useEffect(() => {
    langsRef.current = { myLang, theirLang, location }
    onTurnRef.current = onTurn
  }, [myLang, theirLang, location, onTurn])

  const upsert = useCallback((u: Utterance) => {
    setUtterances((list) => {
      const i = list.findIndex((x) => x.id === u.id)
      if (i < 0) return [...list, u]
      const next = list.slice()
      next[i] = u
      return next
    })
  }, [])

  const save = useCallback(
    (u: Utterance) => {
      upsert(u)
      const conversationId = conversationRef.current
      if (!conversationId) return
      turnsRef.current = [...turnsRef.current, u].slice(-RECENT_TURNS)
      onTurnRef.current?.(u, turnsRef.current, conversationId)
      const { myLang: mine, theirLang: theirs } = langsRef.current
      const saving = fetch("/api/translate/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          speaker: u.speaker,
          lang: u.speaker === "me" ? mine : theirs,
          original: u.original,
          translated: u.translated,
        }),
      })
        .catch(() => undefined)
        .finally(() => savingRef.current.delete(saving))
      savingRef.current.add(saving)
    },
    [upsert]
  )

  const closeDirection = useCallback(
    async (d: Direction) => {
      if (d.closed) return
      d.closed = true
      d.track.enabled = false
      await d.conn?.close()
      d.track.stop()
      const last = d.builder.finish()
      if (last) save(last)
      if (d.openedAt) billedMsRef.current += Date.now() - d.openedAt
      openRef.current.delete(d)
      setSpentUsd((billedMsRef.current / 60_000) * TRANSLATE_USD_PER_MINUTE)
    },
    [save]
  )

  /** Deja de mandar el mic, espera que termine de traducir y cierra. */
  const release = useCallback(async () => {
    const d = activeRef.current
    if (!d || d.releasing) return
    d.releasing = true
    activeRef.current = null
    d.track.enabled = false
    setSpeaker(null)
    if (!d.conn) return // sigue conectando: `open` la cierra al terminar
    setState("finishing")
    const releasedAt = Date.now()
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const now = Date.now()
        if (now - Math.max(d.lastOutputAt, releasedAt) > FLUSH_QUIET_MS || now - releasedAt > FLUSH_MAX_MS) {
          clearInterval(check)
          resolve()
        }
      }, TICK_MS)
    })
    await closeDirection(d)
    if (!activeRef.current && micRef.current) setState("ready")
  }, [closeDirection])

  const open = useCallback(
    async (who: Speaker) => {
      const mic = micRef.current
      if (!mic) return
      const { myLang: mine, theirLang: theirs, location: here } = langsRef.current
      const d: Direction = {
        speaker: who,
        track: mic.getAudioTracks()[0].clone(),
        conn: null,
        builder: new UtteranceBuilder(who),
        openedAt: 0,
        lastOutputAt: Date.now(),
        releasing: false,
        closed: false,
      }
      activeRef.current = d
      openRef.current.add(d)
      setSpeaker(who)
      setState("connecting")

      const res = await fetch("/api/translate/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLang: who === "me" ? theirs : mine,
          myLang: mine,
          theirLang: theirs,
          conversationId: conversationRef.current,
          location: here,
        }),
      })
      const body = (await res.json().catch(() => null)) as SessionResponse | null
      if (!body?.success) throw new Error(body && !body.success ? body.error : "No se pudo abrir la traducción.")
      conversationRef.current = body.data.conversationId

      d.conn = await connectTranslation({
        key: body.data.key,
        track: d.track,
        onEvent: (ev) => {
          if (ev.type === "session.input_transcript.delta" || ev.type === "session.output_transcript.delta") {
            const kind = ev.type === "session.input_transcript.delta" ? "input" : "output"
            if (kind === "output") d.lastOutputAt = Date.now()
            upsert(d.builder.add(kind, ev.delta ?? ""))
          } else if (ev.type === "error") {
            console.error("[translate]", ev.error?.message ?? ev)
          }
        },
      })
      d.openedAt = Date.now()
      // Se soltó (o se cortó todo) mientras conectaba.
      if (activeRef.current !== d) return void closeDirection(d)
      setState("listening")
    },
    [closeDirection, upsert]
  )

  /** Apretar el botón de alguien: si ya hablaba, suelta; si hablaba el otro, cambia. */
  const press = useCallback(
    async (who: Speaker) => {
      if (!micRef.current) return
      if (activeRef.current?.speaker === who) return void release()
      if (activeRef.current) void release()
      try {
        await open(who)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo abrir la traducción.")
        const d = activeRef.current
        if (d?.speaker === who) {
          activeRef.current = null
          void closeDirection(d)
          setSpeaker(null)
          setState(micRef.current ? "ready" : "off")
        }
      }
    },
    [closeDirection, open, release]
  )

  // Cada `stop` cambia la generación: un pedido de mic que llega después se descarta.
  const generationRef = useRef(0)
  const startingRef = useRef(false)

  const start = useCallback(async () => {
    if (micRef.current || startingRef.current) return
    startingRef.current = true
    const generation = generationRef.current
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (generation !== generationRef.current) return mic.getTracks().forEach((t) => t.stop())
      micRef.current = mic
      setState("ready")
    } catch {
      toast.error("Necesito permiso de micrófono para traducir.")
    } finally {
      if (generation === generationRef.current) startingRef.current = false
    }
  }, [])

  const stop = useCallback(async () => {
    generationRef.current++
    startingRef.current = false
    activeRef.current = null
    setSpeaker(null)
    const mic = micRef.current
    micRef.current = null
    await Promise.all([...openRef.current].map((d) => closeDirection(d)))
    mic?.getTracks().forEach((t) => t.stop())
    setState("off")
    const conversationId = conversationRef.current
    conversationRef.current = null
    turnsRef.current = []
    if (conversationId) {
      await Promise.all(savingRef.current)
      void fetch("/api/translate/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }).catch(() => undefined)
    }
  }, [closeDirection])

  // Corte por un minuto sin hablar: con la sesión abierta se cobra igual.
  useEffect(() => {
    if (state !== "listening") return
    const timer = setInterval(() => {
      const d = activeRef.current
      if (d?.conn && Date.now() - d.lastOutputAt > ACTIVE_MAX_MS) {
        toast("Corté la traducción: nadie habló en un minuto.")
        void release()
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [release, state])

  // Al cerrar la pestaña o salir de la pantalla no puede quedar nada cobrando.
  useEffect(() => {
    const onUnload = () => {
      for (const d of openRef.current) void d.conn?.close()
      const conversationId = conversationRef.current
      if (conversationId) navigator.sendBeacon("/api/translate/end", new Blob([JSON.stringify({ conversationId })], { type: "application/json" }))
    }
    window.addEventListener("pagehide", onUnload)
    return () => {
      window.removeEventListener("pagehide", onUnload)
      void stop()
    }
  }, [stop])

  /**
   * Solo para probar sin micrófono (desarrollo): un turno completo como si se hubiera
   * hablado y traducido. Crea la conversación si hace falta y pasa por `save`, igual que
   * un turno real (burbuja, `messages` y recomendaciones).
   */
  const simulate = useCallback(
    async (who: Speaker, original: string, translated: string) => {
      if (!conversationRef.current) {
        const { myLang: mine, theirLang: theirs, location: here } = langsRef.current
        const res = await fetch("/api/translate/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetLang: mine, myLang: mine, theirLang: theirs, conversationId: null, location: here }),
        })
        const body = (await res.json().catch(() => null)) as SessionResponse | null
        if (!body?.success) throw new Error("No se pudo crear la conversación.")
        conversationRef.current = body.data.conversationId
      }
      save({ id: `sim-${Date.now()}`, speaker: who, original, translated, final: true })
    },
    [save]
  )

  return { state, speaker, utterances, spentUsd, start, press, release, stop, simulate }
}
