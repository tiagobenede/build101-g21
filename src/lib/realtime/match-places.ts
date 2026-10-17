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
