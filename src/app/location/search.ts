"use server"

import { z } from "zod"

import { parseTextSearchResults, type GeocodeResult } from "@/lib/location/geocode"
import { createClient } from "@/lib/supabase/server"

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
/** Cada búsqueda se paga: no más de una por segundo por usuario. */
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

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return { success: false, error: "Falta GOOGLE_API_KEY." }

  try {
    // Places Text Search entiende direcciones, esquinas y lugares por nombre ("Montevideo Shopping").
    const res = await fetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({ textQuery: parsed.data, languageCode: "es", maxResultCount: MAX_RESULTS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error("[location] Google respondió", res.status)
      return { success: false, error: "El buscador de lugares no respondió." }
    }
    return { success: true, data: parseTextSearchResults(await res.json()) }
  } catch (err) {
    console.error("[location] Google falló", err instanceof Error ? err.message : err)
    return { success: false, error: "No se pudo buscar el lugar." }
  }
}
