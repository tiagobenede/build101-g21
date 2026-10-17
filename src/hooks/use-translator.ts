"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { LatLng } from "@/lib/geo"
import {
  ACTIVE_MAX_MS,
  RELEASE_TAIL_MS,
  SPEAK_QUIET_MS,
  TRANSLATE_USD_PER_MINUTE,
  TRANSLATE_VOICE,
  type Lang,
  type Speaker,
} from "@/lib/translate/config"
import { connectTranslation, type TranslationConnection } from "@/lib/translate/connection"
import { UtteranceBuilder, type Utterance } from "@/lib/translate/utterances"
import { SentenceSplitter, VoiceQueue } from "@/lib/translate/voice"

/** off: sin mic · ready: mic listo, nada abierto (no cobra) · connecting · listening · finishing: termina de traducir. */
export type TranslatorState = "off" | "ready" | "connecting" | "listening" | "finishing"

type Direction = {
  speaker: Speaker
  track: MediaStreamTrack
  conn: TranslationConnection | null
  builder: UtteranceBuilder
  /** Idioma al que se traduce (el de la voz). */
  targetLang: Lang
  splitter: SentenceSplitter
  speakTimer: ReturnType<typeof setTimeout> | null
  openedAt: number
  lastOutputAt: number
  releasing: boolean
  /** Ya se pidió cerrar (no se vuelve a cerrar). */
  closing: boolean
  /** Ya cortó: lo que llegue no se lee. */
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
  const voiceRef = useRef<VoiceQueue | null>(null)
  const voiceFailedRef = useRef(false)
  /** Una cola para los dos lados: nunca suenan dos traducciones a la vez. */
  const voice = useCallback(
    () =>
      (voiceRef.current ??= new VoiceQueue((err) => {
        console.error("[translate] voz", err)
        if (voiceFailedRef.current) return
        voiceFailedRef.current = true
        toast.error("No pude poner voz a la traducción; sigue el texto.")
      })),
    []
  )
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

  /** Lee lo que quedó sin punto final del lado `d`. */
  const speakRest = useCallback(
    (d: Direction) => {
      if (d.speakTimer) clearTimeout(d.speakTimer)
      d.speakTimer = null
      const rest = d.splitter.flush()
      if (rest) voice().say(rest, d.targetLang)
    },
    [voice]
  )

  const closeDirection = useCallback(
    async (d: Direction) => {
      if (d.closing) return
      d.closing = true
      d.track.enabled = false
      // Hasta que corta, lo que llega se sigue mostrando y leyendo (el final llega al cerrar).
      await d.conn?.close()
      d.closed = true
      d.track.stop()
      speakRest(d)
      const last = d.builder.finish()
      if (last) save(last)
      if (d.openedAt) billedMsRef.current += Date.now() - d.openedAt
      openRef.current.delete(d)
      setSpentUsd((billedMsRef.current / 60_000) * TRANSLATE_USD_PER_MINUTE)
    },
    [save, speakRest]
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
    // Un respiro para que salga el audio de las últimas palabras; después se cierra, y al
    // cerrar el modelo manda lo que le faltaba traducir.
    await new Promise((resolve) => setTimeout(resolve, RELEASE_TAIL_MS))
    await closeDirection(d)
    if (!activeRef.current && micRef.current) setState("ready")
  }, [closeDirection])

  const acquiringRef = useRef(false)

  const open = useCallback(
    async (who: Speaker) => {
      // Mientras se pide el mic (en iPhone, uno nuevo por turno) el botón ya se ve conectando
      // y los toques se ignoran, para no abrir dos traducciones a la vez.
      acquiringRef.current = true
      setSpeaker(who)
      setState("connecting")
      const mic = await liveMic(micRef).finally(() => (acquiringRef.current = false))
      if (!mic) {
        setSpeaker(null)
        setState("off")
        return
      }
      const { myLang: mine, theirLang: theirs, location: here } = langsRef.current
      const targetLang = who === "me" ? theirs : mine
      const d: Direction = {
        speaker: who,
        track: mic.getAudioTracks()[0].clone(),
        conn: null,
        builder: new UtteranceBuilder(who),
        targetLang,
        splitter: new SentenceSplitter(),
        speakTimer: null,
        openedAt: 0,
        lastOutputAt: Date.now(),
        releasing: false,
        closing: false,
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
          targetLang,
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
        muted: TRANSLATE_VOICE === "elevenlabs",
        onEvent: (ev) => {
          if (ev.type === "session.input_transcript.delta" || ev.type === "session.output_transcript.delta") {
            const kind = ev.type === "session.input_transcript.delta" ? "input" : "output"
            // También lo que se transcribe del original: suele llegar después de la traducción,
            // y si se cierra antes se pierden las últimas palabras.
            d.lastOutputAt = Date.now()
            if (kind === "output") {
              if (TRANSLATE_VOICE === "elevenlabs" && !d.closed) {
                for (const sentence of d.splitter.push(ev.delta ?? "")) voice().say(sentence, targetLang)
                if (d.speakTimer) clearTimeout(d.speakTimer)
                d.speakTimer = setTimeout(() => speakRest(d), SPEAK_QUIET_MS)
              }
            }
            upsert(d.builder.add(kind, ev.delta ?? ""))
          } else if (ev.type === "error") {
            console.error("[translate]", ev.error?.message ?? ev)
          }
        },
      })
      d.openedAt = Date.now()
      // Se soltó (o se cortó todo) mientras conectaba.
      if (activeRef.current !== d) {
        await closeDirection(d)
        if (!activeRef.current) setState(micRef.current ? "ready" : "off")
        return
      }
      setState("listening")
    },
    [closeDirection, speakRest, upsert, voice]
  )

  /** Apretar el botón de alguien: si ya hablaba, suelta; si hablaba el otro, cambia. */
  const press = useCallback(
    async (who: Speaker) => {
      if (!micRef.current || acquiringRef.current) return
      // Dentro del toque: destraba la voz de la traducción (Safari lo pide así).
      if (TRANSLATE_VOICE === "elevenlabs") voice().unlock()
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
    [closeDirection, open, release, voice]
  )

  // Cada `stop` cambia la generación: un pedido de mic que llega después se descarta.
  const generationRef = useRef(0)
  const startingRef = useRef(false)

  const start = useCallback(async () => {
    if (micRef.current || startingRef.current) return
    startingRef.current = true
    const generation = generationRef.current
    try {
      const mic = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      if (generation !== generationRef.current) return mic.getTracks().forEach((t) => t.stop())
      micRef.current = mic
      keepMicWhilePlaying(true)
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
    voiceRef.current?.close()
    voiceRef.current = null
    voiceFailedRef.current = false
    mic?.getTracks().forEach((t) => t.stop())
    keepMicWhilePlaying(false)
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

  /** Vuelve a leer la traducción de una frase (corta lo que esté sonando). Llamar en el toque. */
  const repeat = useCallback(
    (u: Utterance) => {
      if (!u.translated) return
      const { myLang: mine, theirLang: theirs } = langsRef.current
      const queue = voice()
      queue.unlock()
      queue.stop()
      queue.say(u.translated, u.speaker === "me" ? theirs : mine)
    },
    [voice]
  )

  return { state, speaker, utterances, spentUsd, start, press, release, stop, simulate, repeat }
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
}

const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent)

/**
 * El micrófono listo para un turno nuevo. En iPhone, reproducir la voz de la traducción
 * (un `<audio>`) con el micrófono abierto deja la pista muteada: los turnos siguientes
 * mandaban silencio y no se traducía nada. Si la pista no sirve (o es iOS), se pide de
 * nuevo; se llama desde el toque del botón, así que iOS no vuelve a preguntar.
 */
async function liveMic(micRef: { current: MediaStream | null }): Promise<MediaStream | null> {
  const mic = micRef.current
  if (!mic) return null
  const track = mic.getAudioTracks()[0]
  if (track && track.readyState === "live" && !track.muted && !isIOS()) return mic
  try {
    const fresh = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
    mic.getTracks().forEach((t) => t.stop())
    micRef.current = fresh
    return fresh
  } catch {
    return mic
  }
}

/**
 * En iPhone, cuando suena la voz de la traducción (un `<audio>`), Safari pasa la sesión de
 * audio a "solo reproducir" y el micrófono queda mudo: el turno siguiente manda silencio y
 * no se traduce nada. Con "play-and-record" el mic sigue andando mientras suena.
 */
function keepMicWhilePlaying(on: boolean) {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = on ? "play-and-record" : "auto"
  } catch {
    // Navegador sin ese tipo de sesión.
  }
}
