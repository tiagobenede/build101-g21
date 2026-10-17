import { z } from "zod"

export type GeocodeResult = { name: string; detail: string; lat: number; lng: number }

const nominatimItem = z.object({
  lat: z.coerce.number().refine(Number.isFinite),
  lon: z.coerce.number().refine(Number.isFinite),
  name: z.string().optional(),
  display_name: z.string(),
})

/** Normaliza la respuesta de Nominatim (datos externos: se valida todo). */
export function parseGeocodeResults(raw: unknown): GeocodeResult[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = nominatimItem.safeParse(item)
    if (!parsed.success) return []
    const parts = parsed.data.display_name.split(",").map((p) => p.trim())
    const name = parsed.data.name || parts[0]
    const detail = parts.filter((p) => p !== name).join(", ")
    return [{ name, detail, lat: parsed.data.lat, lng: parsed.data.lon }]
  })
}

const reverseAddress = z.object({
  road: z.string().optional(),
  pedestrian: z.string().optional(),
  square: z.string().optional(),
  neighbourhood: z.string().optional(),
  quarter: z.string().optional(),
  city_block: z.string().optional(),
  suburb: z.string().optional(),
  city: z.string().optional(),
  town: z.string().optional(),
  village: z.string().optional(),
})

const reverseItem = z.object({ address: reverseAddress })

/**
 * Dirección corta para el agente desde un reverse de Nominatim:
 * "Place des Vosges, Quartier de l'Arsenal, Paris 4e Arrondissement, París".
 * Sin número de puerta (el GPS no da para tanto) ni el nombre del punto, que suele ser
 * un negocio cualquiera: los lugares cercanos ya van aparte. Null sin calle ni barrio.
 */
export function parseReverseGeocode(raw: unknown): string | null {
  const parsed = reverseItem.safeParse(raw)
  if (!parsed.success) return null
  const a = parsed.data.address
  const street = a.road ?? a.pedestrian ?? a.square
  const barrio = a.neighbourhood ?? a.quarter ?? a.city_block
  const city = a.city ?? a.town ?? a.village
  const parts = [street, barrio, a.suburb, city].filter(
    (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i
  )
  if (!street && !barrio) return null
  return parts.join(", ")
}
