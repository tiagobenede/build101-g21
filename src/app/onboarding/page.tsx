import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"
import { needsOnboarding } from "@/lib/data/onboarding"
import { createClient } from "@/lib/supabase/server"

/** Primer login: onboarding por voz (si ya lo hizo, a la home). */
type OnboardingPageProps = { searchParams: Promise<{ demo?: string }> }

/** `?demo=1`: la charla guionada, para ver la pantalla sin micrófono ni gastar. */
export default function OnboardingPage({ searchParams }: OnboardingPageProps) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-white" />}>
      <OnboardingGate searchParams={searchParams} />
    </Suspense>
  )
}

async function OnboardingGate({ searchParams }: OnboardingPageProps) {
  const { demo } = await searchParams
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  if (!(await needsOnboarding(supabase, user.id))) redirect("/")
  return <OnboardingFlow demo={demo === "1"} />
}
