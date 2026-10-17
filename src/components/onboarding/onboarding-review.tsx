"use client"

import { gsap } from "gsap"
import { CheckIcon } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ONBOARDING_QUESTIONS } from "@/lib/onboarding/questions"
import type { OnboardingState } from "@/lib/onboarding/state"
import { cn } from "@/lib/utils"

interface OnboardingReviewProps {
  onboarding: OnboardingState
  saving: boolean
  /** Titulares que el viajero desmarcó. */
  onConfirm: (rejectedTitles: Set<string>, origin: HTMLElement) => void
}

/** Ritmo, horarios, presupuesto y movilidad en frases cortas. */
function profileChips({ pace, schedule, dailyBudget, mobility }: OnboardingState): string[] {
  return [
    pace && `Ritmo ${pace}`,
    schedule && (schedule === "madrugador" ? "Madrugador" : "Noctámbulo"),
    dailyBudget !== null && `~${dailyBudget} € por día`,
    mobility && `Movilidad: ${mobility}`,
  ].filter((c): c is string => Boolean(c))
}

/**
 * Lo que entendió el agente, en bloques por pregunta: titular y una línea. El detalle
 * largo y el porqué no se muestran, pero se guardan para el guía del viaje.
 */
export function OnboardingReview({ onboarding, saving, onConfirm }: OnboardingReviewProps) {
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const chips = profileChips(onboarding)

  useLayoutEffect(() => {
    const blocks = listRef.current?.querySelectorAll("[data-block]")
    if (!blocks?.length) return
    gsap.fromTo(blocks, { y: 28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.out", stagger: 0.08 })
  }, [])

  const toggle = (title: string) =>
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  const groups = ONBOARDING_QUESTIONS.map((q) => ({
    question: q,
    insights: onboarding.insights.filter((i) => i.question === q.id),
  })).filter((g) => g.insights.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-14 pb-32">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Esto es lo que entendí</h1>
        <p className="text-muted-foreground text-[15px]">Tocá lo que no va para sacarlo. Lo demás lo uso para recomendarte en el viaje.</p>
      </header>

      <div ref={listRef} className="flex flex-col gap-5">
        {chips.length > 0 && (
          <div data-block className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="bg-muted rounded-full px-3 py-1.5 text-[13px] font-medium">
                {c}
              </span>
            ))}
          </div>
        )}
        {groups.map(({ question, insights }) => (
          <section key={question.id} data-block className="flex flex-col gap-2">
            <h2 className="text-muted-foreground px-1 text-[13px] font-medium">{question.title}</h2>
            <div className="bg-card flex flex-col overflow-hidden rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {insights.map((insight, i) => {
                const off = rejected.has(insight.title)
                return (
                  <button
                    key={insight.title}
                    type="button"
                    onClick={() => toggle(insight.title)}
                    aria-pressed={!off}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 text-left transition-opacity",
                      i > 0 && "border-border/60 border-t",
                      off && "opacity-45"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        off ? "border-muted-foreground/40" : "border-[#34C759] bg-[#34C759] text-white"
                      )}
                    >
                      {!off && <CheckIcon className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn("text-[15px] font-semibold", off && "line-through")}>{insight.title}</span>
                      <span className="text-muted-foreground text-[13px] leading-snug">{insight.summary}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="from-background fixed inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-60% to-transparent px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Button
          size="lg"
          className={cn("h-12 w-full max-w-md rounded-full text-[16px]", saving && "invisible")}
          disabled={saving}
          onClick={(e) => onConfirm(rejected, e.currentTarget)}
        >
          Confirmar y empezar
        </Button>
      </div>
    </div>
  )
}
