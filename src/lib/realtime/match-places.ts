import type { PlaceCard } from "@/hooks/voice-session-types"

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

/** Lugares conocidos que aparecen en el texto y todavía no se mostraron, en orden de aparición. */
export function findNewPlaces(text: string, places: readonly PlaceCard[], seen: ReadonlySet<string>): PlaceCard[] {
  const haystack = normalize(text)
  return places
    .filter((p) => !seen.has(p.id))
    .map((p) => ({ place: p, index: haystack.indexOf(normalize(p.name)) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ place }) => place)
}

/** Dónde nombra el texto un lugar: completo o, si es largo, por sus dos primeras palabras ("Côté Sushi"). */
function mentionIndex(haystack: string, name: string): number {
  const full = normalize(name)
  const at = haystack.indexOf(full)
  if (at >= 0) return at
  const words = full.split(/\s+/)
  return words.length >= 3 ? haystack.indexOf(words.slice(0, 2).join(" ")) : -1
}

/**
 * El lugar de la pantalla que la voz nombra primero, si no es el destacado (para pasarlo
 * adelante). null si nombra primero el destacado o no nombra ninguno.
 */
export function placeToFeature(text: string, placeIds: readonly string[], places: readonly PlaceCard[]): string | null {
  const haystack = normalize(text)
  const first = placeIds
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is PlaceCard => p !== undefined)
    .map((p) => ({ id: p.id, index: mentionIndex(haystack, p.name) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)[0]
  return first && first.id !== placeIds[0] ? first.id : null
}
