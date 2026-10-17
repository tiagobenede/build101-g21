import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { activeTripId } from "@/lib/data/trips"

/** El viaje en curso (para colgarle la conversación y saber la ciudad), o null. */
export async function activeTrip(supabase: SupabaseClient): Promise<{ id: string; destination: string } | null> {
  const id = await activeTripId(supabase)
  if (!id) return null
  const { data } = await supabase.from("trips").select("id, destination").eq("id", id).maybeSingle()
  return data ? { id: data.id as string, destination: data.destination as string } : null
}
