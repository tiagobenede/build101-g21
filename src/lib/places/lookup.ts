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

/**
 * Google guarda los nombres en castellano y el agente a veces los dice en francés
 * ("Centre Pompidou" por "Centro Nacional de Arte y Cultura Georges Pompidou").
 */
const SAME_WORD: Record<string, string> = {
  centre: "centro",
  musee: "museo",
  place: "plaza",
  eglise: "iglesia",
  cathedrale: "catedral",
  tour: "torre",
  pont: "puente",
  rue: "calle",
  palais: "palacio",
  jardin: "jardin",
  marche: "mercado",
  bibliotheque: "biblioteca",
}
/** Artículos y preposiciones que cambian entre idiomas ("du" / "del"). */
const FILLER_WORDS = new Set(["del", "des", "los", "las", "les", "the", "una", "une"])

const significantWords = (s: string) =>
  normalize(s)
    .split(" ")
    .filter((w) => w.length >= 3 && !FILLER_WORDS.has(w))
    .map((w) => SAME_WORD[w] ?? w)

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

/** Mismo nombre, sin palabras de más ("Torre Eiffel" no es "Jardín de la Torre Eiffel"). */
export const sameName = (a: string, b: string) => namesMatch(a, b) && significantWords(a).length === significantWords(b).length

/** ~5 km alrededor (en longitud se ensancha: en París un grado de longitud mide ~2/3 de uno de latitud). */
const SEARCH_BOX_DEG = 0.045

const PLACE_COLUMNS = "id, name, category, tags, description, lat, lng, rating, typical_visit_minutes, data"

/**
 * Un lugar de `places` por nombre: el más cercano de los que coinciden, o null.
 * Con `exact`, solo el mismo nombre (la foto dice "Torre Eiffel" y no tiene que ser el jardín).
 */
export async function findPlaceByName(db: SupabaseClient, name: string, near: LatLng, { exact = false } = {}): Promise<StoredPlace | null> {
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
      .filter((p) => (exact ? sameName : namesMatch)(p.name, name))
      .sort((a, b) => distanceMeters(near, a) - distanceMeters(near, b))[0] ?? null
  )
}
