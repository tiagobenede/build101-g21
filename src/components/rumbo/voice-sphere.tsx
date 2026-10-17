"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"

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

/** Pensando (`hollow`): sin relleno, contornos que se retuercen más rápido. */
const HOLLOW_MOTION = { wobble: 15, tempo: 1.9 }
/**
 * Contornos del modo pensando: desfase del reloj, escala, grosor y desenfoque de cada uno.
 * Gruesos y muy difuminados: se leen como luz, no como línea.
 */
const RINGS = [
  { lag: 0, scale: 1, width: 7, blur: 6 },
  { lag: 0.9, scale: 0.9, width: 5, blur: 5 },
  { lag: 1.8, scale: 0.8, width: 4, blur: 4 },
] as const
/** Halo que queda detrás de los contornos mientras piensa. */
const HOLLOW_HALO = 0.18
const RING_GRADIENT = "#2F6BFF, #7B5CFF, #FF7AC8, #12B8FF, #2F6BFF"
/** Grados por segundo (de reloj) que gira el degradé de los contornos. */
const RING_SPIN = 70
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
  /** Pensando: se apaga el relleno y quedan solo contornos animados. */
  hollow?: boolean
  className?: string
}

/**
 * Blob de voz: un contorno que cambia de forma suave con manchas de color difuminadas que
 * giran adentro y crecen con la voz. Sin WebGL: un solo requestAnimationFrame escribe los
 * estilos (sin re-renders).
 */
export function VoiceSphere({ state, inputVolumeRef, outputVolumeRef, hollow = false, className }: VoiceSphereProps) {
  const haloRef = useRef<HTMLDivElement>(null)
  const shapeRef = useRef<HTMLDivElement>(null)
  const spotRefs = useRef<(HTMLDivElement | null)[]>([])
  const ringRefs = useRef<(HTMLDivElement | null)[]>([])
  const stateRef = useRef(state)
  const hollowRef = useRef(hollow)

  useEffect(() => {
    stateRef.current = state
    hollowRef.current = hollow
  }, [state, hollow])

  // Layout effect: el primer cuadro se dibuja antes de pintar (si no, se ve redondo un instante).
  useLayoutEffect(() => {
    let frame = 0
    let level = 0
    let wobble = MOTION.off.wobble
    let tempo = MOTION.off.tempo
    // Mientras no arrancó nada, el reloj sale de la hora: dos blobs quietos se ven iguales
    // cuadro a cuadro, así el de la barra se reemplaza por el de /talk sin que se note.
    let synced = true
    let clock = 0
    let hollowMix = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      const volume = s === "talking" ? outputVolumeRef.current : s === "listening" ? inputVolumeRef.current : 0
      level += ((volume ?? 0) - level) * SMOOTHING
      const target = hollowRef.current ? HOLLOW_MOTION : MOTION[s]
      hollowMix += ((hollowRef.current ? 1 : 0) - hollowMix) * EASE
      wobble += (target.wobble + level * VOLUME_WOBBLE - wobble) * EASE
      tempo += (target.tempo - tempo) * EASE
      synced &&= s === "off" && !hollowRef.current
      clock = synced ? (now / 1000) * MOTION.off.tempo : clock + dt * tempo

      const shape = shapeRef.current
      if (shape) {
        shape.style.borderRadius = blobRadius(clock, wobble)
        shape.style.transform = `scale(${(1 + level * VOLUME_SCALE + Math.sin(clock * 0.8) * 0.015) * (1 - hollowMix * 0.2)})`
        shape.style.opacity = String(1 - hollowMix)
      }
      if (haloRef.current) haloRef.current.style.opacity = String(0.3 + (HOLLOW_HALO - 0.3) * hollowMix)
      RINGS.forEach((ring, i) => {
        const el = ringRefs.current[i]
        if (!el) return
        const t = clock - ring.lag
        const stroke = el.firstElementChild as HTMLElement | null
        if (stroke) {
          stroke.style.borderRadius = blobRadius(t, wobble)
          stroke.style.background = `conic-gradient(from ${t * RING_SPIN}deg, ${RING_GRADIENT})`
        }
        el.style.transform = `scale(${ring.scale * (1 + Math.sin(t * 1.4) * 0.03)}) rotate(${t * 12}deg)`
        el.style.opacity = String(hollowMix * (1 - i * 0.22))
      })
      SPOTS.forEach((spot, i) => {
        const el = spotRefs.current[i]
        if (!el) return
        const a = clock * spot.speed + spot.phase
        const orbit = spot.orbit * (1 + level * 0.6)
        el.style.transform = `translate(${Math.cos(a) * orbit}%, ${Math.sin(a * 1.3) * orbit}%) scale(${1 + level * 0.35})`
      })
      frame = requestAnimationFrame(tick)
    }
    tick(performance.now())
    return () => cancelAnimationFrame(frame)
  }, [inputVolumeRef, outputVolumeRef])

  return (
    <div className={cn("relative shrink-0", className)} aria-hidden>
      {/* Halo difuso detrás, con los mismos colores. */}
      <div
        ref={haloRef}
        className="absolute inset-[10%] rounded-full bg-[conic-gradient(from_200deg,#2F6BFF,#7B5CFF,#12B8FF,#2F6BFF)] opacity-30 blur-2xl"
      />
      {/*
        Modo pensando: anillos con degradé. La máscara (que deja solo el borde) va adentro y
        el blur afuera: si comparten elemento, la máscara recorta el desenfoque.
      */}
      {RINGS.map((ring, i) => (
        <div
          key={ring.lag}
          ref={(el) => {
            ringRefs.current[i] = el
          }}
          className="absolute inset-0 opacity-0 will-change-transform"
          style={{ filter: `blur(${ring.blur}px)` }}
        >
          <div
            className="absolute inset-0"
            style={{
              padding: ring.width,
              mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
            }}
          />
        </div>
      ))}
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
