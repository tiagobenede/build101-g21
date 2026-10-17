import { distanceMeters, type LatLng } from "@/lib/geo"

/** Al alejarse esto del origen de la ruta vigente, se pide una nueva (te desviaste o avanzaste bastante). */
export const REROUTE_METERS = 40

/**
 * Lo que falta caminar: desde donde estás, por la ruta a partir del punto más cercano,
 * hasta el lugar. Sin ruta, línea recta. La ruta de Google empieza y termina en la calle:
 * se une a los dos puntos.
 */
export function remainingWalk(from: LatLng, path: LatLng[] | null, to: LatLng): LatLng[] {
  if (!path || path.length === 0) return [from, to]
  let nearest = 0
  let best = Infinity
  path.forEach((point, i) => {
    const meters = distanceMeters(from, point)
    if (meters < best) {
      best = meters
      nearest = i
    }
  })
  return [from, ...path.slice(nearest), to]
}

/** Largo de una línea de puntos, en metros. */
export function pathMeters(points: LatLng[]): number {
  let meters = 0
  for (let i = 1; i < points.length; i++) meters += distanceMeters(points[i - 1], points[i])
  return meters
}
