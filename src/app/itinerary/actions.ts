"use server"

import { refresh } from "next/cache"

import {
  addItineraryItem,
  removeItineraryItem,
  setItineraryStatus,
  undoItinerary,
  updateItineraryItem,
  type AddItemInput,
  type UpdateItemInput,
} from "@/lib/data/itinerary"
import type { Result } from "@/lib/data/result"
import type { ItineraryItem } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"

/**
 * Itinerario desde la UI (B-3). La lógica vive en `src/lib/data/itinerary.ts`, que
 * también usan los tools del agente. Si el cambio salió bien, se refresca la pantalla.
 */

async function withRefresh<T>(result: Promise<Result<T>>): Promise<Result<T>> {
  const r = await result
  if (r.ok) refresh()
  return r
}

export async function addItem(input: AddItemInput): Promise<Result<ItineraryItem>> {
  return withRefresh(addItineraryItem(await createClient(), input, "user"))
}

export async function updateItem(id: string, input: UpdateItemInput): Promise<Result<ItineraryItem>> {
  return withRefresh(updateItineraryItem(await createClient(), id, input, "user"))
}

export async function setItemStatus(id: string, status: ItineraryItem["status"]): Promise<Result<ItineraryItem>> {
  return withRefresh(setItineraryStatus(await createClient(), id, status))
}

export async function removeItem(id: string): Promise<Result<{ id: string }>> {
  return withRefresh(removeItineraryItem(await createClient(), id, "user"))
}

export async function undo(): Promise<Result<{ items: number }>> {
  return withRefresh(undoItinerary(await createClient()))
}
