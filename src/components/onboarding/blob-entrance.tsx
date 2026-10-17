"use client"

import { gsap } from "gsap"
import { useLayoutEffect, useRef, type RefObject } from "react"

import { VoiceSphere } from "@/components/rumbo/voice-sphere"
import type { CallState } from "@/hooks/voice-session-types"

/** Lo que dura la entrada (subida + aplastada + rebote). */
const LANDING_MS = 2_200

interface BlobEntranceProps {
  state: CallState
  inputVolumeRef: RefObject<number>
  outputVolumeRef: RefObject<number>
  /** Pensando: el blob queda solo en contorno. */
  hollow?: boolean
  /** Termina la entrada: el blob ya está quieto en su lugar. */
  onLanded: () => void
}

/**
 * El blob entra desde abajo de la pantalla: sube rápido estirado, se aplasta al frenar y
 * rebota elástico hasta quedar redondo.
 */
export function BlobEntrance({ state, inputVolumeRef, outputVolumeRef, hollow, onLanded }: BlobEntranceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const onLandedRef = useRef(onLanded)

  useLayoutEffect(() => {
    onLandedRef.current = onLanded
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Una sola vez: al terminar la animación o, si el equipo va lento (el shader pesa y GSAP
    // frena el tiempo cuando los frames tardan), al tiempo que dura la animación.
    let landed = false
    const land = () => {
      if (landed) return
      landed = true
      onLandedRef.current()
    }
    const fallback = setTimeout(land, LANDING_MS)
    const tl = gsap.timeline({ onComplete: land })
    tl.fromTo(
      el,
      { y: "75vh", scaleX: 0.62, scaleY: 1.5, autoAlpha: 1 },
      { y: 0, scaleX: 0.92, scaleY: 1.12, duration: 0.8, ease: "power4.out" }
    )
      .to(el, { scaleX: 1.2, scaleY: 0.82, duration: 0.16, ease: "power2.out" }, "-=0.22")
      .to(el, { scaleX: 1, scaleY: 1, duration: 1.2, ease: "elastic.out(1.1, 0.3)" })
    return () => {
      clearTimeout(fallback)
      tl.kill()
    }
  }, [])

  return (
    <div ref={ref} className="invisible will-change-transform">
      <VoiceSphere state={state} inputVolumeRef={inputVolumeRef} outputVolumeRef={outputVolumeRef} hollow={hollow} className="size-56 sm:size-64" />
    </div>
  )
}
