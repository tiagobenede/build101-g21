export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_M = 6_371_000
/** Velocidad de caminata urbana (~5 km/h). */
export const WALK_METERS_PER_MINUTE = 80

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Distancia en línea recta (haversine) en metros. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Minutos caminando, con un factor 1.3 porque las calles no son línea recta. */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round((distanceMeters(a, b) * 1.3) / WALK_METERS_PER_MINUTE))
}

/** Más lejos que esto, un lugar ya no sirve para decir dónde estás. */
export const LABEL_RADIUS_METERS = 300

/**
 * Nombre del lugar más cercano para decir dónde está el viajero ("Place des Vosges").
 * Solo el nombre: las pantallas ya le ponen "Estás cerca de" alrededor.
 */
export function nearestPlaceLabel(
  location: LatLng,
  places: readonly (LatLng & { name: string })[],
  fallback: string
): string {
  let best: { name: string; meters: number } | null = null
  for (const p of places) {
    const meters = distanceMeters(location, p)
    if (meters <= LABEL_RADIUS_METERS && (!best || meters < best.meters)) best = { name: p.name, meters }
  }
  return best?.name ?? fallback
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`
}
