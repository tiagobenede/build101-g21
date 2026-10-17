"use client"

import { useEffect, useRef, type RefObject } from "react"

import type { CallState } from "@/hooks/voice-session-types"
import { cn } from "@/lib/utils"

/**
 * Manchas de color que orbitan adentro del blob, muy difuminadas: se mezclan entre sí como
 * un mesh gradient. `orbit` es cuánto se alejan del centro (en % del tamaño).
 */
const SPOTS = [
  { color: "#2F6BFF", size: 78, orbit: 18, speed: 0.55, phase: 0 },
  { color: "#7B5CFF", size: 66, orbit: 24, speed: -0.42, phase: 2.2 },
  { color: "#12B8FF", size: 60, orbit: 22, speed: 0.7, phase: 4.1 },
  { color: "#FF7AC8", size: 40, orbit: 28, speed: -0.6, phase: 1.1 },
] as const

/** Cuánto se deforma el contorno y qué tan rápido se mueve, por estado (el volumen suma encima). */
const MOTION: Record<CallState, { wobble: number; tempo: number }> = {
  off: { wobble: 6, tempo: 0.6 },
  connecting: { wobble: 8, tempo: 1.2 },
  listening: { wobble: 8, tempo: 0.9 },
  thinking: { wobble: 10, tempo: 1.7 },
  talking: { wobble: 10, tempo: 1.3 },
}

const SMOOTHING = 0.12
const VOLUME_SCALE = 0.2
const VOLUME_WOBBLE = 9
/** Los cambios de estado se mezclan de a poco: nunca un salto. */
const EASE = 0.05

/** border-radius orgánico: 8 radios que respiran con senos desfasados. */
function blobRadius(t: number, wobble: number): string {
  const r = (i: number) => 50 + wobble * Math.sin(t * (1 + i * 0.17) + i * 1.9)
  return `${r(0)}% ${100 - r(0)}% ${r(1)}% ${100 - r(1)}% / ${r(2)}% ${r(3)}% ${100 - r(3)}% ${100 - r(2)}%`
}

interface VoiceSphereProps {
  state: CallState
  inputVolumeRef: RefObject<number>
  outputVolumeRef: RefObject<number>
  className?: string
}

/**
 * Blob de voz: un contorno que cambia de forma suave con manchas de color difuminadas que
 * giran adentro y crecen con la voz. Sin WebGL: un solo requestAnimationFrame escribe los
 * estilos (sin re-renders).
 */
export function VoiceSphere({ state, inputVolumeRef, outputVolumeRef, className }: VoiceSphereProps) {
  const shapeRef = useRef<HTMLDivElement>(null)
  const spotRefs = useRef<(HTMLDivElement | null)[]>([])
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let frame = 0
    let level = 0
    let wobble = MOTION.off.wobble
    let tempo = MOTION.off.tempo
    let clock = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      const volume = s === "talking" ? outputVolumeRef.current : s === "listening" ? inputVolumeRef.current : 0
      level += ((volume ?? 0) - level) * SMOOTHING
      wobble += (MOTION[s].wobble + level * VOLUME_WOBBLE - wobble) * EASE
      tempo += (MOTION[s].tempo - tempo) * EASE
      clock += dt * tempo

      const shape = shapeRef.current
      if (shape) {
        shape.style.borderRadius = blobRadius(clock, wobble)
        shape.style.transform = `scale(${1 + level * VOLUME_SCALE + Math.sin(clock * 0.8) * 0.015})`
      }
      SPOTS.forEach((spot, i) => {
        const el = spotRefs.current[i]
        if (!el) return
        const a = clock * spot.speed + spot.phase
        const orbit = spot.orbit * (1 + level * 0.6)
        el.style.transform = `translate(${Math.cos(a) * orbit}%, ${Math.sin(a * 1.3) * orbit}%) scale(${1 + level * 0.35})`
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inputVolumeRef, outputVolumeRef])

  return (
    <div className={cn("relative shrink-0", className)} aria-hidden>
      {/* Halo difuso detrás, con los mismos colores. */}
      <div className="absolute inset-[10%] rounded-full bg-[conic-gradient(from_200deg,#2F6BFF,#7B5CFF,#12B8FF,#2F6BFF)] opacity-30 blur-2xl" />
      <div
        ref={shapeRef}
        className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#E9F1FF,#B9CFFF_80%)] shadow-[inset_0_0_20px_rgba(255,255,255,0.6)] will-change-transform"
        style={{ borderRadius: "50%" }}
      >
        {SPOTS.map((spot, i) => (
          <div
            key={spot.color}
            ref={(el) => {
              spotRefs.current[i] = el
            }}
            className="absolute rounded-full opacity-95 blur-lg will-change-transform"
            style={{
              width: `${spot.size}%`,
              height: `${spot.size}%`,
              left: `${(100 - spot.size) / 2}%`,
              top: `${(100 - spot.size) / 2}%`,
              background: `radial-gradient(circle, ${spot.color} 0%, ${spot.color}cc 35%, ${spot.color}00 72%)`,
            }}
          />
        ))}
        {/* Brillo de vidrio arriba a la izquierda. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.6),transparent_38%)]" />
      </div>
    </div>
  )
}
