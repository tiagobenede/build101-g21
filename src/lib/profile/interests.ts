/**
 * Gustos del viajero: los de la lista (`INTEREST_TAGS`: autos, arte, comida…) y los que dijo
 * con sus palabras ("McDonald's", "hospitales"). Todos viven en la tabla `interests` y todas
 * las funciones (agente, avisos por cercanía, mapa, home) los cruzan con los lugares acá.
 */

export const MAX_INTEREST_LENGTH = 40
const MIN_INTEREST_LENGTH = 2
/** Palabras que no dicen nada del gusto ("los autos" = "autos"). */
const STOPWORDS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "y", "the", "of"])

/** Lo que se guarda: minúsculas, espacios simples, sin comillas raras. null si no sirve. */
export function normalizeInterest(raw: string): string | null {
  const clean = raw.replace(/[’`´]/g, "'").replace(/\s+/g, " ").trim().toLowerCase()
  if (clean.length < MIN_INTEREST_LENGTH || clean.length > MAX_INTEREST_LENGTH) return null
  return clean
}

/** Palabras comparables: sin tildes, apóstrofes ni signos ("McDonald’s" → "mcdonalds"). */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

/** Singular aproximado, en castellano e inglés: "hospitales" → "hospital", "autos" → "auto". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1)
  return word
}

export type MatchablePlace = {
  name: string
  category?: string | null
  tags: readonly string[]
  /** Tipos de Google ("fast_food_restaurant", "hospital"). */
  googleTypes?: readonly string[] | null
}

/**
 * Los gustos del viajero que tiene este lugar, en el orden del viajero. Un tag de la lista
 * coincide con `tags`; un gusto propio coincide si todas sus palabras aparecen en el nombre,
 * la categoría o los tipos de Google del lugar.
 */
export function matchInterests(place: MatchablePlace, interests: readonly string[]): string[] {
  const haystack = new Set(
    words([place.name, place.category ?? "", ...(place.googleTypes ?? [])].join(" ")).flatMap((w) => [w, stem(w)])
  )
  return interests.filter((interest) => {
    if (place.tags.includes(interest)) return true
    const needed = words(interest)
    return needed.length > 0 && needed.every((w) => haystack.has(w) || haystack.has(stem(w)))
  })
}
