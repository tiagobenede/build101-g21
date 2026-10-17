"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { completeOnboarding } from "@/app/onboarding/actions"
import { useOnboardingCall, type OnboardingEnd } from "@/hooks/use-onboarding-call"
import { useSimulatedOnboarding } from "@/hooks/use-simulated-onboarding"
import { LAST_QUESTION, ONBOARDING_QUESTIONS } from "@/lib/onboarding/questions"
import { extractionSchema } from "@/lib/onboarding/schema"
import { toResult, type OnboardingState } from "@/lib/onboarding/state"

import { BlobEntrance } from "./blob-entrance"
import { KeywordBubbles } from "./keyword-bubbles"
import { OnboardingReview } from "./onboarding-review"
import { HOME_SETTLE_MS, playSuccessTransition, waitForPath } from "./success-transition"
import { QuestionHeadline } from "./question-headline"

/** Pantalla en blanco antes de que entre el blob (mientras se conecta la llamada). */
const INTRO_MS = 2_200

type Phase = "intro" | "talk" | "review"

/** Arma el resumen con la transcripción (modelo de texto en el server). */
async function summarize(end: OnboardingEnd): Promise<OnboardingState> {
  const res = await fetch("/api/onboarding/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: end.transcript }),
  })
  const parsed = extractionSchema.safeParse(res.ok ? await res.json() : null)
  if (!parsed.success) throw new Error("No pude armar tu resumen.")
  const { insights, pace, schedule, daily_budget, mobility } = parsed.data
  return { ...end.state, insights, pace, schedule, dailyBudget: daily_budget, mobility }
}

/**
 * Onboarding por voz: pantalla en blanco, el blob entra desde abajo con la llamada ya
 * conectada, el agente recorre 5 preguntas (titular arriba, burbujas abajo) y al final
 * el viajero confirma lo que entendió.
 */
interface OnboardingFlowProps {
  /** Charla guionada, sin micrófono ni OpenAI (`/onboarding?demo=1`). */
  demo?: boolean
}

export function OnboardingFlow({ demo = false }: OnboardingFlowProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("intro")
  const [landed, setLanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Lo que se muestra para confirmar; null mientras se arma. */
  const [review, setReview] = useState<OnboardingState | null>(null)

  const save = useCallback(
    async (result: Parameters<typeof completeOnboarding>[0], origin?: HTMLElement) => {
      setSaving(true)
      router.prefetch("/")
      const transition = origin ? playSuccessTransition(origin) : null
      const [res] = await Promise.all([
        completeOnboarding(result).catch(() => ({ ok: false as const, error: "No pude guardar tu perfil." })),
        transition?.shown,
      ])
      if (!res.ok) {
        await transition?.dismiss()
        setSaving(false)
        toast.error(res.error)
        return
      }
      router.replace("/")
      router.refresh()
      if (!transition) return
      // El overlay vive fuera de React: se desvanece cuando la home ya está montada.
      await waitForPath("/")
      await new Promise((r) => setTimeout(r, HOME_SETTLE_MS))
      await transition.dismiss()
    },
    [router]
  )

  // El agente cerró (o lo salteó): al resumen, o directo a la home si no contó nada.
  const onFinished = useCallback(
    (end: OnboardingEnd) => {
      if (end.state.insights.length > 0) {
        setReview(end.state)
        setPhase("review")
        return
      }
      if (!end.transcript.some((t) => t.role === "user")) return void save(null)
      setPhase("review")
      summarize(end)
        .then(setReview)
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "No pude armar tu resumen.")
          void save(null)
        })
    },
    [save]
  )
  // La prop no cambia durante la vida de la pantalla: siempre se llama al mismo hook.
  const call = (demo ? useSimulatedOnboarding : useOnboardingCall)(onFinished)
  const { connect, begin, hangUp, snapshot, onboarding } = call

  // La llamada se abre ya; el blob aparece cuando está conectada y pasó la intro.
  const open = useCallback(async () => {
    setFailed(false)
    const [connected] = await Promise.all([connect(), new Promise((r) => setTimeout(r, INTRO_MS))])
    if (connected) setPhase("talk")
    else setFailed(true)
  }, [connect])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre la llamada al entrar (efecto externo)
    void open()
  }, [open])

  const onLanded = useCallback(() => {
    setLanded(true)
    begin()
  }, [begin])

  const skip = () => {
    hangUp()
    onFinished(snapshot())
  }

  if (phase === "review") {
    return review ? (
      <OnboardingReview onboarding={review} saving={saving} onConfirm={(rejected, origin) => void save(toResult(review, rejected), origin)} />
    ) : (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white">
        <span className="bg-muted-foreground/40 size-2.5 animate-ping rounded-full" />
        <p className="text-muted-foreground text-[15px]">Armando tu resumen…</p>
      </main>
    )
  }

  const question = ONBOARDING_QUESTIONS[onboarding.question - 1]

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-white">
      <button
        type="button"
        onClick={skip}
        disabled={saving}
        className="text-muted-foreground/60 hover:text-muted-foreground absolute top-[max(1rem,env(safe-area-inset-top))] right-4 text-[13px] underline underline-offset-4 transition-colors"
      >
        Ahora no, saltear
      </button>

      <div className="flex min-h-[9.5rem] w-full items-end justify-center pt-20">
        {landed && <QuestionHeadline step={question.id} total={LAST_QUESTION} title={question.title} />}
      </div>

      <div className="flex flex-1 items-center justify-center">
        {phase === "talk" && (
          <BlobEntrance
            state={call.state}
            inputVolumeRef={call.inputVolumeRef}
            outputVolumeRef={call.outputVolumeRef}
            onLanded={onLanded}
          />
        )}
        {failed && (
          <button type="button" onClick={() => void open()} className="text-muted-foreground text-[15px] underline underline-offset-4">
            No pude conectar la voz. Tocá para reintentar.
          </button>
        )}
      </div>

      <div className="flex min-h-40 w-full items-start justify-center pb-[max(2rem,env(safe-area-inset-bottom))]">
        <KeywordBubbles keywords={onboarding.keywords} />
      </div>
    </main>
  )
}
