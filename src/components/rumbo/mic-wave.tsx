"use client"

import { useEffect, useRef, type RefObject } from "react"

import { cn } from "@/lib/utils"

/** Barras de la onda: la más nueva entra por la derecha. */
const BARS = 36
/** Cada cuánto entra una barra nueva (ms): ~1,8 s de historia a la vista. */
const SAMPLE_MS = 50
/** El volumen del mic es bajo (0–0,3 al hablar normal): se amplifica para que se lea. */
const GAIN = 4
/** Altura mínima: en silencio queda una línea de puntos, no desaparece. */
const FLOOR = 0.08

interface MicWaveProps {
  volumeRef: RefObject<number>
  /** Mic silenciado: la onda queda plana. */
  muted?: boolean
  className?: string
}

/**
 * Onda de lo que capta el micrófono, tenue: sirve para saber si tu voz está llegando.
 * Un requestAnimationFrame escribe las alturas directo en el DOM (sin re-renders).
 */
export function MicWave({ volumeRef, muted = false, className }: MicWaveProps) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  const mutedRef = useRef(muted)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    const levels = new Array<number>(BARS).fill(0)
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      if (now - last >= SAMPLE_MS) {
        last = now
        const raw = mutedRef.current ? 0 : (volumeRef.current ?? 0)
        levels.shift()
        levels.push(Math.min(1, Math.sqrt(raw * GAIN)))
        levels.forEach((level, i) => {
          const el = barRefs.current[i]
          if (el) el.style.transform = `scaleY(${Math.max(FLOOR, level)})`
        })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [volumeRef])

  return (
    <div
      role="img"
      aria-label={muted ? "Micrófono silenciado" : "Nivel de tu micrófono"}
      className={cn("flex h-7 items-center justify-center gap-[3px]", className)}
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el
          }}
          className="bg-muted-foreground/35 h-full w-[3px] rounded-full transition-transform duration-75 ease-out"
          // Las puntas se apagan: se lee como una onda que entra y sale, no como una caja.
          style={{ transform: `scaleY(${FLOOR})`, opacity: (0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / BARS)).toFixed(2) }}
        />
      ))}
    </div>
  )
}
