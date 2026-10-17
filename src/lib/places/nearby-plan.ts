/**
 * Qué se le pide a Google Places (Nearby Search) alrededor del viajero. Puro, para testearlo.
 *
 * Dos escalas:
 * - Zona (~1 km): lo más popular a 1,5 km, en búsquedas separadas por rubro para que la
 *   comida no tape todo (Google devuelve como mucho 20 por búsqueda).
 * - Cuadra (~400 m): lo más cercano a donde está parado, sin importar la fama. Así aparece
 *   el café de la esquina aunque no sea de los 20 más conocidos del barrio.
 */
import type { LatLng } from "@/lib/geo"

import { FOOD_TYPES, SHOP_TYPES, SIGHT_TYPES } from "./google-types"

export type NearbyQuery = {
  /** Zona a la que pertenece: si ya se pidió hace poco, no se repite. */
  cell: string
  includedTypes: string[]
  radius: number
  rankPreference: "POPULARITY" | "DISTANCE"
}

const AREA_DECIMALS = 2
const AREA_RADIUS_METERS = 1_500
/** Grilla de ~440 m (en latitud) para lo que está a la vuelta. */
const BLOCK_STEP_DEGREES = 0.004
const BLOCK_RADIUS_METERS = 450

export const areaCell = ({ lat, lng }: LatLng) => `area:${lat.toFixed(AREA_DECIMALS)},${lng.toFixed(AREA_DECIMALS)}`
export const blockCell = ({ lat, lng }: LatLng) =>
  `block:${Math.round(lat / BLOCK_STEP_DEGREES)},${Math.round(lng / BLOCK_STEP_DEGREES)}`

export function nearbyQueries(location: LatLng): NearbyQuery[] {
  const area = areaCell(location)
  const block = blockCell(location)
  return [
    ...[FOOD_TYPES, SIGHT_TYPES, SHOP_TYPES].map((includedTypes) => ({
      cell: area,
      includedTypes,
      radius: AREA_RADIUS_METERS,
      rankPreference: "POPULARITY" as const,
    })),
    ...[FOOD_TYPES, [...SIGHT_TYPES, ...SHOP_TYPES]].map((includedTypes) => ({
      cell: block,
      includedTypes,
      radius: BLOCK_RADIUS_METERS,
      rankPreference: "DISTANCE" as const,
    })),
  ]
}
