"use client"

import { gsap } from "gsap"
import { useLayoutEffect, useRef, useState } from "react"

interface QuestionHeadlineProps {
  /** Número y texto de la pregunta actual. */
  step: number
  total: number
  title: string
}

/** Titular de la pregunta: la vieja se va hacia arriba y la nueva sube desde abajo. */
export function QuestionHeadline({ step, total, title }: QuestionHeadlineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState({ step, title })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || title === shown.title) return
    const tween = gsap.to(el, {
      y: -18,
      autoAlpha: 0,
      filter: "blur(6px)",
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => setShown({ step, title }),
    })
    return () => {
      tween.kill()
    }
  }, [step, title, shown.title])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    gsap.fromTo(
      el,
      { y: 22, autoAlpha: 0, filter: "blur(6px)" },
      { y: 0, autoAlpha: 1, filter: "blur(0px)", duration: 0.7, ease: "power3.out" }
    )
  }, [shown])

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 px-6 text-center" aria-live="polite">
      <span className="text-muted-foreground text-[13px] font-medium tracking-wide tabular-nums">
        {shown.step} de {total}
      </span>
      <h1 className="max-w-md text-[28px] leading-tight font-semibold tracking-tight text-balance sm:text-[34px]">{shown.title}</h1>
    </div>
  )
}
