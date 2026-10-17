"use server"

import { compileProfileSummary } from "@/lib/profile/summary"
import { onboardingStyleText } from "@/lib/onboarding/profile-text"
import { onboardingResultSchema, type OnboardingResult } from "@/lib/onboarding/schema"
import { createClient } from "@/lib/supabase/server"

export type OnboardingSaveResult = { ok: true } | { ok: false; error: string }

/**
 * Guarda lo que el viajero confirmó: gustos, restricciones y ritmo en el perfil; cada
 * insight como un hecho (con su detalle y su porqué); el texto completo en `travel_style`
 * para que el guía lo lea en cada llamada. Sin resultado (lo salteó), solo marca el onboarding.
 */
export async function completeOnboarding(input: OnboardingResult | null): Promise<OnboardingSaveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Sin sesión." }

  if (input === null) {
    const { error } = await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id)
    if (error) return failWith("skip", error.message)
    return { ok: true }
  }

  const parsed = onboardingResultSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "No pude leer lo que confirmaste." }
  const { insights, pace, schedule, dailyBudget, mobility } = parsed.data

  const interests = [...new Set(insights.filter((i) => !i.avoid && i.interest).map((i) => i.interest!))]
  const dietary = [...new Set(insights.map((i) => i.diet).filter((d) => d !== null))]
  const facts = insights.map((i) => ({
    user_id: user.id,
    kind: i.kind,
    statement: i.detail,
    polarity: i.avoid ? -1 : 1,
    source: "stated",
    evidence: i.why,
  }))
  const summary = compileProfileSummary(
    [...facts].reverse().map((f) => ({ kind: f.kind, statement: f.statement, polarity: f.polarity as 1 | -1 }))
  )

  if (facts.length > 0) {
    const { error } = await supabase.from("profile_facts").insert(facts)
    if (error) return failWith("facts", error.message)
  }
  if (interests.length > 0) {
    const { error } = await supabase
      .from("interests")
      .upsert(
        interests.map((tag) => ({ user_id: user.id, tag })),
        { onConflict: "user_id,tag", ignoreDuplicates: true }
      )
    if (error) return failWith("interests", error.message)
  }
  const { error } = await supabase
    .from("profiles")
    .update({
      travel_style: onboardingStyleText(insights),
      dietary,
      pace,
      schedule,
      daily_budget: dailyBudget,
      mobility,
      compiled_summary: summary,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id)
  if (error) return failWith("profile", error.message)
  return { ok: true }
}

function failWith(step: string, message: string): OnboardingSaveResult {
  console.error(`[onboarding] save ${step} failed`, message)
  return { ok: false, error: "No pude guardar tu perfil. Probá de nuevo." }
}
