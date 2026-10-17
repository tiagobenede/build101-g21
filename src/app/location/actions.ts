"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).nullable(),
  source: z.enum(["mock", "real"]),
})

export type PingInput = z.infer<typeof pingSchema>
export type PingResult = { success: true } | { success: false; error: string }

// Códigos de "la tabla no existe" (Postgres y PostgREST): pings la crea la migración de C-1.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"])
let warnedMissingTable = false

/** Guarda la posición del usuario (GPS simulado o real). */
export async function savePing(input: PingInput): Promise<PingResult> {
  const parsed = pingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Posición inválida." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sin sesión." }

  const { error } = await supabase.from("pings").insert({ ...parsed.data, user_id: user.id })
  if (!error) return { success: true }

  if (MISSING_TABLE_CODES.has(error.code)) {
    if (!warnedMissingTable) console.warn("[location] La tabla pings todavía no existe (migración de C-1).")
    warnedMissingTable = true
    return { success: false, error: "pings no existe todavía." }
  }
  console.error("[location] savePing failed", error.message)
  return { success: false, error: "No se pudo guardar la ubicación." }
}
