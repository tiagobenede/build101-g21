import { distanceMeters, type LatLng } from "@/lib/geo"

/** Velocidad de caminata para el GPS simulado (m/s). */
export const WALK_SPEED_MPS = 1.4
/** Multiplicadores de velocidad del joystick. */
export const SPEED_MULTIPLIERS = [1, 5, 20] as const
export type SpeedMultiplier = (typeof SPEED_MULTIPLIERS)[number]

/** Se manda un ping cada este tiempo si hubo movimiento... */
export const PING_INTERVAL_MS = 5_000
/** ...o antes, si se movió esta distancia. */
export const PING_DISTANCE_M = 25
/** Por debajo de esto se considera quieto (ruido del GPS). */
const MIN_MOVEMENT_M = 1
/** Al moverse esto, se refrescan las pantallas del server (home, contexto del agente). */
export const REFRESH_DISTANCE_M = 100

const METERS_PER_DEGREE_LAT = 111_320

export type Vector = { x: number; y: number }
export type PingMark = { position: LatLng; at: number }

/** Nueva posición tras caminar `seconds` con el joystick en `vector` (x = este, y = norte, -1..1). */
export function stepPosition(position: LatLng, vector: Vector, seconds: number, multiplier: number): LatLng {
  if (vector.x === 0 && vector.y === 0) return position
  const meters = WALK_SPEED_MPS * multiplier * seconds
  const north = vector.y * meters
  const east = vector.x * meters
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((position.lat * Math.PI) / 180)
  return {
    lat: position.lat + north / METERS_PER_DEGREE_LAT,
    lng: position.lng + east / metersPerDegreeLng,
  }
}

/** Rumbo en grados desde el norte, en sentido horario. */
export function headingFromVector(vector: Vector): number {
  const degrees = (Math.atan2(vector.x, vector.y) * 180) / Math.PI
  return (degrees + 360) % 360
}

export function shouldSendPing(last: PingMark | null, current: LatLng, now: number): boolean {
  if (!last) return true
  const moved = distanceMeters(last.position, current)
  if (moved >= PING_DISTANCE_M) return true
  return moved >= MIN_MOVEMENT_M && now - last.at >= PING_INTERVAL_MS
}

export function shouldRefresh(lastRefreshed: LatLng | null, current: LatLng): boolean {
  return !lastRefreshed || distanceMeters(lastRefreshed, current) >= REFRESH_DISTANCE_M
}
