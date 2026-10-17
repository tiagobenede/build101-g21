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
