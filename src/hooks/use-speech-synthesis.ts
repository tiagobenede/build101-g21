"use client"

import { useCallback, useEffect, useRef } from "react"

const FALLBACK_MS_PER_CHAR = 30

interface SpeakOptions {
  onProgress: (charIndex: number) => void
  onEnd: () => void
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const prefix = lang.slice(0, 2)
  return (
    voices.find((v) => v.lang === lang && /google|natural|premium|enhanced/i.test(v.name)) ??
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(prefix)) ??
    null
  )
}

/**
 * Voz del agente con speechSynthesis del navegador. Expone un volumen de salida
 * simulado (0..1) para animar el orb mientras habla.
 */
export function useSpeechSynthesis(lang: string) {
  const outputVolumeRef = useRef(0)
  const speakingRef = useRef(false)
  const boostRef = useRef(0)
  const timersRef = useRef<number[]>([])

  // Volumen sintético: ondas superpuestas + picos en cada palabra.
  useEffect(() => {
    let frame = 0
    const tick = (t: number) => {
      boostRef.current *= 0.9
      outputVolumeRef.current = speakingRef.current
        ? Math.min(1, 0.25 + 0.25 * Math.abs(Math.sin(t / 90)) * Math.abs(Math.sin(t / 233)) + boostRef.current)
        : outputVolumeRef.current * 0.9
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }

  const cancel = useCallback(() => {
    clearTimers()
    speakingRef.current = false
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel()
  }, [])

  /** Fallback sin audio: revela el texto palabra por palabra. */
  const simulate = useCallback((text: string, { onProgress, onEnd }: SpeakOptions) => {
    speakingRef.current = true
    const words = [...text.matchAll(/\S+/g)]
    words.forEach((m) => {
      timersRef.current.push(
        window.setTimeout(() => {
          boostRef.current = 0.35
          onProgress((m.index ?? 0) + m[0].length)
        }, (m.index ?? 0) * FALLBACK_MS_PER_CHAR)
      )
    })
    timersRef.current.push(
      window.setTimeout(() => {
        speakingRef.current = false
        onProgress(text.length)
        onEnd()
      }, text.length * FALLBACK_MS_PER_CHAR + 300)
    )
  }, [])

  const speak = useCallback(
    (text: string, opts: SpeakOptions, { muted }: { muted: boolean }) => {
      cancel()
      if (muted || !("speechSynthesis" in window)) return simulate(text, opts)

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      utterance.rate = 1.05
      const voice = pickVoice(lang)
      if (voice) utterance.voice = voice

      let gotBoundary = false
      utterance.onstart = () => {
        speakingRef.current = true
        // Algunas voces no emiten "boundary": revelamos el texto por tiempo.
        timersRef.current.push(
          window.setTimeout(() => {
            if (!gotBoundary) simulateReveal(text, opts.onProgress, timersRef.current)
          }, 400)
        )
      }
      utterance.onboundary = (e) => {
        gotBoundary = true
        boostRef.current = 0.4
        opts.onProgress(e.charIndex + (e.charLength || 1))
      }
      const finish = () => {
        clearTimers()
        speakingRef.current = false
        opts.onProgress(text.length)
        opts.onEnd()
      }
      utterance.onend = finish
      utterance.onerror = finish
      window.speechSynthesis.speak(utterance)
    },
    [cancel, lang, simulate]
  )

  useEffect(() => cancel, [cancel])

  return { outputVolumeRef, speak, cancel }
}

function simulateReveal(text: string, onProgress: (i: number) => void, timers: number[]) {
  for (const m of text.matchAll(/\S+/g)) {
    timers.push(window.setTimeout(() => onProgress((m.index ?? 0) + m[0].length), (m.index ?? 0) * 60))
  }
}
