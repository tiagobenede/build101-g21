import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/** El viaje en curso (para colgarle la conversación y saber la ciudad), o null. */
export async function activeTrip(supabase: SupabaseClient): Promise<{ id: string; destination: string } | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from("trips")
    .select("id, destination")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { id: data.id as string, destination: data.destination as string } : null
}
