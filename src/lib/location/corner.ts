/**
 * Esquina más cercana y "dónde estás exacto" para el agente. Puro: el pedido a Google
 * vive en `where.ts`.
 */
import { z } from "zod"

import { distanceMeters, type LatLng } from "@/lib/geo"

/** Más lejos que esto, la esquina que encontró Google no es la de acá. */
export const MAX_CORNER_METERS = 200
/** Hasta acá se dice "en la esquina de"; más lejos, "a N m de la esquina con". */
const AT_CORNER_METERS = 25
/** Calles que se cruzan con la principal: cada una es un pedido a Google. */
const MAX_PAIRS = 4

export type Corner = { streets: [string, string]; at: LatLng; meters: number }

/** Dónde está parado el viajero: calle, esquina y coordenadas. */
export type Where = {
  location: LatLng
  street: string | null
  barrio: string | null
  city: string | null
  corner: Corner | null
}

const reverseResponse = z.object({
  status: z.string(),
  results: z
    .array(z.object({ address_components: z.array(z.object({ long_name: z.string(), types: z.array(z.string()) })) }))
    .default([]),
})

/** Calles (`route`) de un reverse de Google, sin repetir y en el orden en que aparecen. */
export function routesFromReverse(raw: unknown): string[] {
  const parsed = reverseResponse.safeParse(raw)
  if (!parsed.success || parsed.data.status !== "OK") return []
  const names = parsed.data.results.flatMap((r) => r.address_components.filter((c) => c.types.includes("route")).map((c) => c.long_name))
  return [...new Set(names)]
}

const forwardResponse = z.object({
  status: z.string(),
  results: z
    .array(z.object({ types: z.array(z.string()), geometry: z.object({ location: z.object({ lat: z.number(), lng: z.number() }) }) }))
    .default([]),
})

/** Punto de "A & B" si Google lo reconoce como esquina; si devolvió otra cosa (una sola calle), null. */
export function parseIntersection(raw: unknown): LatLng | null {
  const parsed = forwardResponse.safeParse(raw)
  if (!parsed.success || parsed.data.status !== "OK") return null
  const hit = parsed.data.results.find((r) => r.types.includes("intersection"))
  return hit ? hit.geometry.location : null
}

/** Pares a probar: la calle donde está, con cada una de las otras. */
export function cornerPairs(streets: readonly string[]): [string, string][] {
  const [main, ...others] = streets
  if (!main) return []
  return others.slice(0, MAX_PAIRS).map((other) => [main, other])
}

/** La esquina más cercana de las que existen, si está a menos de `MAX_CORNER_METERS`. */
export function pickCorner(location: LatLng, corners: readonly { streets: [string, string]; at: LatLng }[]): Corner | null {
  const withDistance = corners
    .map((c) => ({ ...c, meters: distanceMeters(location, c.at) }))
    .filter((c) => c.meters <= MAX_CORNER_METERS)
    .sort((a, b) => a.meters - b.meters)
  return withDistance[0] ?? null
}

const coords = ({ lat, lng }: LatLng) => `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}.`

/**
 * "Sobre Rue Rambuteau, a 70 m de la esquina con Rue Beaubourg (Beaubourg, París).
 * Coordenadas: 48.86060, 2.35220." Para que el agente pueda decir dónde está exacto.
 */
export function whereLine({ location, street, barrio, city, corner }: Where): string {
  const area = [barrio, city].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i && p !== street).join(", ")
  const inArea = area ? ` (${area})` : ""
  if (corner) {
    const [main, cross] = corner.streets
    const place =
      corner.meters <= AT_CORNER_METERS
        ? `En la esquina de ${main} y ${cross}`
        : `Sobre ${main}, a ${Math.round(corner.meters / 10) * 10} m de la esquina con ${cross}`
    return `${place}${inArea}. ${coords(location)}`
  }
  if (street) return `Sobre ${street}${inArea}. ${coords(location)}`
  return coords(location)
}
