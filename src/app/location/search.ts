"use server"

import { z } from "zod"

import { parseGeocodeResults, type GeocodeResult } from "@/lib/location/geocode"
import { createClient } from "@/lib/supabase/server"

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
// Nominatim pide identificarse y no más de 1 búsqueda por segundo.
const USER_AGENT = "Rumbo/0.1 (hackathon demo)"
const MIN_INTERVAL_MS = 1_000
const TIMEOUT_MS = 5_000
const MAX_RESULTS = 5

const querySchema = z.string().trim().min(2).max(100)
const lastSearchByUser = new Map<string, number>()

export type SearchResult = { success: true; data: GeocodeResult[] } | { success: false; error: string }

/** Busca un lugar en cualquier parte del mundo para mover la ubicación simulada. */
export async function searchLocation(query: string): Promise<SearchResult> {
  const parsed = querySchema.safeParse(query)
  if (!parsed.success) return { success: false, error: "Escribí al menos 2 letras." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sin sesión." }

  const now = Date.now()
  if (now - (lastSearchByUser.get(user.id) ?? 0) < MIN_INTERVAL_MS) {
    return { success: false, error: "Esperá un segundo entre búsquedas." }
  }
  lastSearchByUser.set(user.id, now)

  const url = new URL(NOMINATIM_URL)
  url.search = new URLSearchParams({
    q: parsed.data,
    format: "jsonv2",
    limit: String(MAX_RESULTS),
    "accept-language": "es",
  }).toString()

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) {
      console.error("[location] Nominatim respondió", res.status)
      return { success: false, error: "El buscador de lugares no respondió." }
    }
    return { success: true, data: parseGeocodeResults(await res.json()) }
  } catch (err) {
    console.error("[location] Nominatim falló", err instanceof Error ? err.message : err)
    return { success: false, error: "No se pudo buscar el lugar." }
  }
}
