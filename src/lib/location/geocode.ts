/**
 * Respuestas de Google (Geocoding y Places Text Search) → lo que usa Rumbo. Puro y validado:
 * son datos externos.
 */
import { z } from "zod"

export type GeocodeResult = { name: string; detail: string; lat: number; lng: number }

/** Dónde está un punto "en palabras", de lo más chico a lo más grande. */
export type AddressParts = {
  street: string | null
  barrio: string | null
  city: string | null
  country: string | null
  /** ISO 3166-1 alfa-2 ("FR"): para el idioma del lugar, sin depender del nombre traducido. */
  countryCode: string | null
}

const textSearchItem = z.object({
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().default(""),
  location: z.object({ latitude: z.number().finite(), longitude: z.number().finite() }),
})

/** Resultados del buscador de ubicación (Places Text Search). */
export function parseTextSearchResults(raw: unknown): GeocodeResult[] {
  const places = z.object({ places: z.array(z.unknown()).default([]) }).safeParse(raw)
  if (!places.success) return []
  return places.data.places.flatMap((item) => {
    const parsed = textSearchItem.safeParse(item)
    if (!parsed.success) return []
    const { displayName, formattedAddress, location } = parsed.data
    const name = displayName.text
    const detail = formattedAddress
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && p !== name)
      .join(", ")
    return [{ name, detail, lat: location.latitude, lng: location.longitude }]
  })
}

const component = z.object({ long_name: z.string(), short_name: z.string().optional(), types: z.array(z.string()) })
const reverseResponse = z.object({
  status: z.string(),
  results: z.array(z.object({ address_components: z.array(component) })).default([]),
})

/** En orden de preferencia: el primer tipo que aparezca define la parte. */
const PART_TYPES: Record<Exclude<keyof AddressParts, "countryCode">, string[]> = {
  street: ["route"],
  barrio: ["neighborhood", "sublocality_level_1", "sublocality"],
  city: ["locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1"],
  country: ["country"],
}

/** Calle, barrio, ciudad y país de un reverse de Google Geocoding (null si no hay resultados). */
export function parseGoogleReverse(raw: unknown): AddressParts | null {
  const parsed = reverseResponse.safeParse(raw)
  if (!parsed.success || parsed.data.status !== "OK" || parsed.data.results.length === 0) return null
  const components = parsed.data.results.flatMap((r) => r.address_components)
  const find = (types: string[], name: "long_name" | "short_name" = "long_name") => {
    for (const type of types) {
      const hit = components.find((c) => c.types.includes(type))
      if (hit) return hit[name] ?? null
    }
    return null
  }
  return {
    street: find(PART_TYPES.street),
    barrio: find(PART_TYPES.barrio),
    city: find(PART_TYPES.city),
    country: find(PART_TYPES.country),
    countryCode: find(PART_TYPES.country, "short_name")?.toUpperCase() ?? null,
  }
}

/**
 * Dirección corta para el agente: "Av. Ramón Anador, La Blanqueada, Montevideo". Sin número
 * de puerta (el GPS no da para tanto). Null sin calle ni barrio.
 */
export function streetLine(parts: AddressParts | null): string | null {
  if (!parts || (!parts.street && !parts.barrio)) return null
  return [parts.street, parts.barrio, parts.city].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i).join(", ")
}
