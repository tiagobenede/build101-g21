"use client"

import { gsap } from "gsap"
import { useLayoutEffect, useRef, type RefObject } from "react"

import type { CallState } from "@/hooks/voice-session-types"
import { cn } from "@/lib/utils"

import { VoiceSphere } from "./voice-sphere"

/** Lo que dice debajo del blob antes de arrancar la llamada. */
export const TALK_STATUS_IDLE = "Tocá para empezar a hablar"

interface VoiceStageProps {
  state: CallState
  inputVolumeRef: RefObject<number>
  outputVolumeRef: RefObject<number>
  /** Hay recomendaciones en pantalla: el blob sube y queda como un glow arriba. */
  glow: boolean
  /** Texto chico debajo del blob ("Tocá para empezar a hablar"). Se oculta con el glow. */
  status: string
  /** Tocar el blob empieza la llamada (solo con la llamada cortada y sin glow). */
  onStart?: () => void
  className?: string
}

/**
 * El blob de la llamada. Sin recomendaciones, en el medio de la pantalla. Cuando llega la
 * primera, se estira, sube y se abre hasta salir por arriba: queda un halo difuso con sus
 * colores (sigue reaccionando a la voz). Si la pantalla se vacía, vuelve al centro.
 */
export function VoiceStage({ state, inputVolumeRef, outputVolumeRef, glow, status, onStart, className }: VoiceStageProps) {
  const blobRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const first = useRef(true)

  useLayoutEffect(() => {
    const blob = blobRef.current
    const label = statusRef.current
    if (!blob || !label) return
    // Al montar ya en modo glow (volver a la pantalla), sin animación.
    const instant = first.current
    first.current = false

    const tl = gsap.timeline()
    if (glow) {
      tl.to(label, { autoAlpha: 0, y: -8, duration: instant ? 0 : 0.25 })
        // Se estira hacia arriba, como si lo tiraran...
        .to(blob, { scaleX: 0.85, scaleY: 1.25, y: "-6vh", duration: instant ? 0 : 0.28, ease: "power2.in" }, 0)
        // ...y sale por arriba abriéndose en un halo.
        .to(blob, {
          y: "-50vh",
          scaleX: 3.4,
          scaleY: 2,
          filter: "blur(44px)",
          opacity: 0.9,
          duration: instant ? 0 : 1,
          ease: "power3.out",
        })
    } else {
      tl.to(blob, { y: 0, scaleX: 1, scaleY: 1, filter: "blur(0px)", opacity: 1, duration: instant ? 0 : 0.9, ease: "power3.inOut" })
        .to(blob, { scaleX: 1, scaleY: 1, duration: 0 })
        .to(label, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.3 }, instant ? 0 : "-=0.2")
    }
    return () => {
      tl.kill()
    }
  }, [glow])

  const tappable = Boolean(onStart) && state === "off" && !glow

  return (
    <div className={cn("pointer-events-none flex flex-col items-center gap-3", className)}>
      <div ref={blobRef} className="will-change-transform">
        <button
          type="button"
          onClick={onStart}
          disabled={!tappable}
          aria-label="Empezar a hablar con Rumbo"
          className={cn(
            "block rounded-full transition-transform duration-200 focus-visible:ring-4 focus-visible:ring-[#0071E3]/30 focus-visible:outline-none",
            tappable && "pointer-events-auto cursor-pointer hover:scale-[1.03] active:scale-95"
          )}
        >
          <VoiceSphere state={state} inputVolumeRef={inputVolumeRef} outputVolumeRef={outputVolumeRef} className="size-56" />
        </button>
      </div>
      <p ref={statusRef} className="text-muted-foreground h-5 text-[15px]">
        {status}
      </p>
    </div>
  )
}
