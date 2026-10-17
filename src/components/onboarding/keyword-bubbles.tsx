"use client"

import { gsap } from "gsap"
import { useLayoutEffect, useRef, type CSSProperties } from "react"

import type { Keyword } from "@/lib/onboarding/state"

/** Las últimas que se ven: las viejas dejan lugar a las nuevas. */
const MAX_VISIBLE = 9
const ROTATIONS = [-6, 4, -3, 7, -8, 3, 6, -4, 5]
/** Colores de sistema de iOS al pasar el mouse (como el BubbleMenu). */
const HOVER = ["#0071E3", "#34C759", "#FF9500", "#FF2D55", "#AF52DE", "#30B0C7"]
const POP_DURATION = 0.5
const STAGGER = 0.12

interface KeywordBubblesProps {
  keywords: Keyword[]
}

/**
 * Burbujas con las palabras clave que el agente va anotando: aparecen desde la nada con
 * un pop elástico y el texto sube adentro (animación del BubbleMenu, con GSAP).
 */
export function KeywordBubbles({ keywords }: KeywordBubblesProps) {
  const visible = keywords.slice(-MAX_VISIBLE)
  const animated = useRef(new Set<string>())
  const bubbles = useRef(new Map<string, HTMLElement>())
  const labels = useRef(new Map<string, HTMLElement>())

  useLayoutEffect(() => {
    const fresh = visible.filter((k) => !animated.current.has(k.id))
    fresh.forEach((k, i) => {
      animated.current.add(k.id)
      const bubble = bubbles.current.get(k.id)
      const label = labels.current.get(k.id)
      if (!bubble || !label) return
      // La rotación va por GSAP: si fuera CSS, el scale de la animación la pisaría.
      gsap.set(bubble, { scale: 0, rotation: Number(bubble.dataset.rot ?? 0), transformOrigin: "50% 50%" })
      gsap.set(label, { y: 24, autoAlpha: 0 })
      gsap
        .timeline({ delay: i * STAGGER + gsap.utils.random(-0.05, 0.05) })
        .to(bubble, { scale: 1, duration: POP_DURATION, ease: "back.out(1.5)" })
        .to(label, { y: 0, autoAlpha: 1, duration: POP_DURATION, ease: "power3.out" }, `-=${POP_DURATION * 0.9}`)
    })
  }, [visible])

  return (
    <ul className="flex max-w-xl flex-wrap justify-center gap-2.5 px-6" aria-label="Lo que fuiste contando">
      {visible.map((k, i) => (
        <li key={k.id}>
          <span
            ref={(el) => {
              if (el) bubbles.current.set(k.id, el)
              else bubbles.current.delete(k.id)
            }}
            className="keyword-bubble inline-flex cursor-default items-center overflow-hidden rounded-full bg-white px-4 py-2 text-[15px] font-medium text-[#1d1d1f] shadow-[0_4px_14px_rgba(0,0,0,0.10)] will-change-transform"
            data-rot={ROTATIONS[i % ROTATIONS.length]}
            style={{ "--hover-bg": HOVER[i % HOVER.length] } as CSSProperties}
          >
            <span
              ref={(el) => {
                if (el) labels.current.set(k.id, el)
                else labels.current.delete(k.id)
              }}
              className="inline-block leading-[1.2]"
            >
              {k.text}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
