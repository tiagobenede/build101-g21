"use server"

import { after } from "next/server"
import { z } from "zod"

import { distanceMeters } from "@/lib/geo"
import { REFRESH_DISTANCE_M } from "@/lib/location/simulate"
import { checkProximity } from "@/lib/proximity/engine"
import { createClient } from "@/lib/supabase/server"

const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).nullable(),
  source: z.enum(["mock", "real"]),
})

export type PingInput = z.infer<typeof pingSchema>
/**
 * `movedFar`: la posición está lejos del ping anterior guardado (otra ciudad, otro
 * dispositivo, pasó de simulada a GPS). Las pantallas se armaron con aquel: hay que refrescar.
 */
export type PingResult = { success: true; movedFar: boolean } | { success: false; error: string }

/** Guarda la posición del usuario (GPS simulado o real). */
export async function savePing(input: PingInput): Promise<PingResult> {
  const parsed = pingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Posición inválida." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sin sesión." }

  const { data: previous, error: previousError } = await supabase
    .from("pings")
    .select("lat, lng")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (previousError) console.error("[location] last ping read failed", previousError.message)
  const movedFar = previous ? distanceMeters(previous, parsed.data) >= REFRESH_DISTANCE_M : false

  const { error } = await supabase.from("pings").insert({ ...parsed.data, user_id: user.id })
  if (!error) {
    // Avisos por cercanía (C-6): después de responder, para no frenar las demás server actions.
    const position = { lat: parsed.data.lat, lng: parsed.data.lng }
    after(async () => {
      await checkProximity(await createClient(), user.id, position).catch((err: unknown) =>
        console.error("[proximity]", err instanceof Error ? err.message : err)
      )
    })
    return { success: true, movedFar }
  }

  console.error("[location] savePing failed", error.message)
  return { success: false, error: "No se pudo guardar la ubicación." }
}
