import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { INTEREST_TAGS } from "@/lib/agent/rank"
import { fail, ok, type Result } from "@/lib/data/result"
import { compileProfileSummary, type ProfileFact } from "@/lib/profile/summary"

/**
 * Perfil del viajero: gustos y restricciones que edita la UI (B-2) y lo que el agente
 * aprende hablando (`remember`, A-3). Mismo patrón que `itinerary.ts`: reciben el
 * cliente del usuario logueado y devuelven un `Result` con el error en español.
 */

const profileSchema = z.object({
  interests: z.array(z.enum(INTEREST_TAGS)).max(INTEREST_TAGS.length),
  dietary: z.array(z.string().trim().min(1).max(40)).max(10),
  mobility: z.string().trim().min(1).max(80).nullable(),
  dailyBudget: z.number().int().min(0).max(100_000).nullable(),
  pace: z.enum(["tranquilo", "intenso"]).nullable(),
  schedule: z.enum(["madrugador", "noctámbulo"]).nullable(),
})

export type ProfileInput = z.input<typeof profileSchema>

const factSchema = z.object({
  statement: z.string().trim().min(3).max(300),
  kind: z.enum(["constraint", "preference"]),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  source: z.enum(["stated", "inferred"]),
  evidence: z.string().trim().max(500).nullable(),
  /** Hecho anterior que este reemplaza ("ahora sí como carne"). */
  supersedes: z.uuid().nullable(),
})

export type FactInput = z.input<typeof factSchema>

async function userId(db: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await db.auth.getUser()
  return user?.id ?? null
}

async function guarded<T>(label: string, run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run()
  } catch (err) {
    console.error(`[profile] ${label}`, err instanceof Error ? err.message : err)
    return fail("No pude guardar el perfil. Probá de nuevo.")
  }
}

/** Reescribe `compiled_summary` con los hechos vigentes. */
async function recompileSummary(db: SupabaseClient, uid: string): Promise<string | null> {
  const { data, error } = await db
    .from("profile_facts")
    .select("kind, statement, polarity")
    .eq("user_id", uid)
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)

  const summary = compileProfileSummary(data as ProfileFact[])
  const { error: updateError } = await db.from("profiles").update({ compiled_summary: summary }).eq("id", uid)
  if (updateError) throw new Error(updateError.message)
  return summary
}

/** Guarda gustos, restricciones y ritmo (el formulario "Editar mis gustos"). */
export function updateProfile(db: SupabaseClient, input: ProfileInput): Promise<Result<null>> {
  return guarded("update", async () => {
    const parsed = profileSchema.safeParse(input)
    if (!parsed.success) return fail("Perfil inválido.")
    const v = parsed.data
    const uid = await userId(db)
    if (!uid) return fail("Sin sesión.")

    const { error } = await db
      .from("profiles")
      .update({
        dietary: [...new Set(v.dietary)],
        mobility: v.mobility,
        daily_budget: v.dailyBudget,
        pace: v.pace,
        schedule: v.schedule,
      })
      .eq("id", uid)
    if (error) throw new Error(error.message)

    // Gustos: se borran los que ya no están y se agregan los nuevos (se conserva el orden de los que quedan).
    const tags = [...new Set(v.interests)]
    const { error: deleteError } = await db
      .from("interests")
      .delete()
      .eq("user_id", uid)
      .not("tag", "in", `(${tags.map((t) => `"${t}"`).join(",") || '""'})`)
    if (deleteError) throw new Error(deleteError.message)
    if (tags.length > 0) {
      const { error: upsertError } = await db
        .from("interests")
        .upsert(
          tags.map((tag) => ({ user_id: uid, tag })),
          { onConflict: "user_id,tag", ignoreDuplicates: true }
        )
      if (upsertError) throw new Error(upsertError.message)
    }
    return ok(null)
  })
}

/** Guarda algo que el agente aprendió ("soy vegetariana") y actualiza el resumen del perfil. */
export function rememberFact(db: SupabaseClient, input: FactInput): Promise<Result<{ id: string; summary: string | null }>> {
  return guarded("remember", async () => {
    const parsed = factSchema.safeParse(input)
    if (!parsed.success) return fail("No entendí qué guardar.")
    const v = parsed.data
    const uid = await userId(db)
    if (!uid) return fail("Sin sesión.")

    const { data, error } = await db
      .from("profile_facts")
      .insert({
        user_id: uid,
        kind: v.kind,
        statement: v.statement,
        polarity: v.polarity,
        source: v.source,
        evidence: v.evidence,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)

    if (v.supersedes) {
      const { error: supersedeError } = await db
        .from("profile_facts")
        .update({ superseded_by: data.id })
        .eq("id", v.supersedes)
      if (supersedeError) throw new Error(supersedeError.message)
    }

    return ok({ id: data.id as string, summary: await recompileSummary(db, uid) })
  })
}

/** Olvida un hecho (lo borra) y actualiza el resumen. */
export function forgetFact(db: SupabaseClient, id: string): Promise<Result<{ summary: string | null }>> {
  return guarded("forget", async () => {
    if (!z.uuid().safeParse(id).success) return fail("No encontré eso.")
    const uid = await userId(db)
    if (!uid) return fail("Sin sesión.")

    const { error } = await db.from("profile_facts").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return ok({ summary: await recompileSummary(db, uid) })
  })
}
