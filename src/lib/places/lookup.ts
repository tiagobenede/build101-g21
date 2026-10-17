import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Place } from "@/lib/agent/types"
import { distanceMeters, type LatLng } from "@/lib/geo"

export type StoredPlace = Place & { data: { google_place_id?: string; types?: string[]; website?: string } | null }

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const significantWords = (s: string) => normalize(s).split(" ").filter((w) => w.length >= 3)

/**
 * El agente dice el nombre como lo escuchó ("Marché des Enfants Rouges" por "Marché
 * couvert des Enfants Rouges"): alcanza con que las palabras de uno estén en el otro.
 */
export const namesMatch = (a: string, b: string) => {
  const x = significantWords(a)
  const y = significantWords(b)
  if (x.length === 0 || y.length === 0) return false
  const contains = (big: string[], small: string[]) => small.every((w) => big.includes(w))
  return contains(x, y) || contains(y, x)
}

/** ~5 km alrededor (en longitud se ensancha: en París un grado de longitud mide ~2/3 de uno de latitud). */
const SEARCH_BOX_DEG = 0.045

const PLACE_COLUMNS = "id, name, category, tags, description, lat, lng, rating, typical_visit_minutes, data"

/** Un lugar de `places` por nombre: el más cercano de los que coinciden, o null. */
export async function findPlaceByName(db: SupabaseClient, name: string, near: LatLng): Promise<StoredPlace | null> {
  if (significantWords(name).length === 0) return null
  // `ilike` no ignora acentos ("marche" ≠ "Marché"): traemos lo de la zona y comparamos acá.
  const { data, error } = await db
    .from("places")
    .select(PLACE_COLUMNS)
    .gte("lat", near.lat - SEARCH_BOX_DEG)
    .lte("lat", near.lat + SEARCH_BOX_DEG)
    .gte("lng", near.lng - SEARCH_BOX_DEG * 1.5)
    .lte("lng", near.lng + SEARCH_BOX_DEG * 1.5)
    .limit(500)
  if (error) throw new Error(`No se pudo buscar el lugar: ${error.message}`)

  return (
    (data as StoredPlace[])
      .filter((p) => namesMatch(p.name, name))
      .sort((a, b) => distanceMeters(near, a) - distanceMeters(near, b))[0] ?? null
  )
}
