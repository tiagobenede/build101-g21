import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"

/** ¿Le falta el onboarding? (perfil sin `onboarded_at`). */
export async function needsOnboarding(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from("profiles").select("onboarded_at").eq("id", userId).single()
  if (error) {
    console.error("[onboarding] read profile failed", error.message)
    return false
  }
  return data.onboarded_at === null
}

/**
 * Cuenta de "primer login": cada vez que entra se borra lo que se guardó la vez anterior
 * (gustos, hechos, restricciones), así el onboarding arranca de cero y lo que confirme
 * vale para esta sesión.
 */
export async function resetFirstLoginProfile(userId: string): Promise<void> {
  const admin = createAdminClient()
  const results = await Promise.all([
    admin.from("interests").delete().eq("user_id", userId),
    admin.from("profile_facts").delete().eq("user_id", userId),
    admin
      .from("profiles")
      .update({
        travel_style: null,
        dietary: [],
        mobility: null,
        daily_budget: null,
        pace: null,
        schedule: null,
        compiled_summary: null,
        onboarded_at: null,
      })
      .eq("id", userId),
  ])
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(`No se pudo resetear el perfil: ${failed.error.message}`)
}
