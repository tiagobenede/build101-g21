"use server"

import { refresh } from "next/cache"

import type { Result } from "@/lib/data/result"
import type { ItineraryItem } from "@/lib/data/session"
import { addTipToPlan, setTipStatus } from "@/lib/data/tips"
import { createClient } from "@/lib/supabase/server"

/** Cards de recomendaciones de residentes (B-5). La lógica vive en `src/lib/data/tips.ts`. */

export async function saveTip(id: string): Promise<Result<{ id: string }>> {
  return setTipStatus(await createClient(), id, "saved")
}

export async function dismissTip(id: string): Promise<Result<{ id: string }>> {
  return setTipStatus(await createClient(), id, "dismissed")
}

/** `startsAt` en ISO con zona horaria (la card elige la hora). */
export async function addTipToItinerary(id: string, startsAt: string): Promise<Result<ItineraryItem>> {
  const r = await addTipToPlan(await createClient(), id, startsAt, "user")
  if (r.ok) refresh()
  return r
}
