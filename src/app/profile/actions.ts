"use server"

import { refresh } from "next/cache"

import { forgetFact, setInterest, updateProfile, type ProfileInput } from "@/lib/data/profile"
import type { Result } from "@/lib/data/result"
import { createClient } from "@/lib/supabase/server"

/**
 * Perfil desde la UI (B-2). `rememberFact` no está acá: lo usa el agente desde su tool.
 * La lógica vive en `src/lib/data/profile.ts`.
 */

export async function saveProfile(input: ProfileInput): Promise<Result<null>> {
  const r = await updateProfile(await createClient(), input)
  if (r.ok) refresh()
  return r
}

export async function forgetProfileFact(id: string): Promise<Result<{ summary: string | null }>> {
  const r = await forgetFact(await createClient(), id)
  if (r.ok) refresh()
  return r
}

/** Prende, apaga o suma (uno escrito a mano) un gusto desde "Tus gustos" en el perfil. */
export async function toggleInterest(tag: string, on: boolean): Promise<Result<null>> {
  const r = await setInterest(await createClient(), tag, on)
  if (r.ok) refresh()
  return r
}
