"use client"

import { gsap } from "gsap"
import { useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { TALK_STATUS_IDLE } from "@/components/rumbo/voice-stage"
import { VoiceSphere } from "@/components/rumbo/voice-sphere"
import { cn } from "@/lib/utils"

const NO_VOLUME = { current: 0 }

/**
 * El blob chiquito del medio de la barra. Al tocarlo sube hasta donde vive en /talk y se
 * agranda (con la pantalla de fondo apareciendo); cuando llega, recién ahí se navega. /talk
 * arranca con el mismo blob en el mismo lugar, así que el cambio no se nota.
 */
export function AgentLauncher() {
  const router = useRouter()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [from, setFrom] = useState<DOMRect | null>(null)

  useEffect(() => {
    router.prefetch("/talk")
  }, [router])

  // Next guarda la pantalla oculta al navegar: al volver, el blob tiene que estar en la barra.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el vuelo al volver a mostrar la pantalla
    setFrom(null)
  }, [])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Hablar con Rumbo"
        onClick={() => setFrom(buttonRef.current?.getBoundingClientRect() ?? null)}
        className={cn(
          "relative -mt-6 flex size-16 items-center justify-center rounded-full transition-transform active:scale-90",
          from && "opacity-0",
        )}
      >
        <VoiceSphere state="off" inputVolumeRef={NO_VOLUME} outputVolumeRef={NO_VOLUME} className="size-14" />
      </button>
      {from && <BlobFlight from={from} onArrive={() => router.push("/talk")} />}
    </>
  )
}

/** Tamaño del blob en /talk (`size-56` en VoiceStage). */
const STAGE_BLOB_PX = 224

function BlobFlight({ from, onArrive }: { from: DOMRect; onArrive: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const blobRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLParagraphElement>(null)
  const arrive = useRef(onArrive)

  useLayoutEffect(() => {
    const backdrop = backdropRef.current
    const blob = blobRef.current
    const label = labelRef.current
    if (!backdrop || !blob || !label) return
    // Medir sin transform: si el efecto corre de nuevo, el anterior dejó el blob movido.
    gsap.set(blob, { clearProps: "transform" })
    const to = blob.getBoundingClientRect()
    const tl = gsap.timeline({ onComplete: () => arrive.current() })
    tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0)
      .fromTo(
        blob,
        {
          x: from.left + from.width / 2 - (to.left + to.width / 2),
          y: from.top + from.height / 2 - (to.top + to.height / 2),
          scale: (from.width * 0.875) / STAGE_BLOB_PX,
        },
        { x: 0, y: 0, scale: 1, duration: 0.6, ease: "power3.inOut" },
        0,
      )
      .fromTo(label, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 0.45)
    return () => {
      tl.kill()
    }
  }, [from])

  return (
    <div className="fixed inset-0 z-50" aria-hidden>
      <div ref={backdropRef} className="bg-background absolute inset-0" />
      {/* Mismo armado que VoiceStage en /talk: el blob aterriza justo encima del suyo. */}
      <div className="absolute inset-x-0 top-[30%] flex flex-col items-center gap-3">
        <div ref={blobRef} className="will-change-transform">
          <VoiceSphere state="off" inputVolumeRef={NO_VOLUME} outputVolumeRef={NO_VOLUME} className="size-56" />
        </div>
        <p ref={labelRef} className="text-muted-foreground h-5 text-[15px]">
          {TALK_STATUS_IDLE}
        </p>
      </div>
    </div>
  )
}
