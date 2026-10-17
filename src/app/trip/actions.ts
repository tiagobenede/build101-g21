"use server"

import { refresh } from "next/cache"

import type { Result } from "@/lib/data/result"
import { createInvite, joinTrip, leaveTrip } from "@/lib/data/trips"
import { createClient } from "@/lib/supabase/server"

/** Viaje compartido (L-1). La lógica vive en `src/lib/data/trips.ts`. */

export async function createTripInvite(): Promise<Result<{ code: string; expiresAt: string }>> {
  return createInvite(await createClient())
}

export async function joinTripWithCode(code: string): Promise<Result<{ tripId: string }>> {
  const r = await joinTrip(await createClient(), code)
  if (r.ok) refresh()
  return r
}

export async function leaveCurrentTrip(): Promise<Result<null>> {
  const r = await leaveTrip(await createClient())
  if (r.ok) refresh()
  return r
}
