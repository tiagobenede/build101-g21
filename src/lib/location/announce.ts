import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo"

/** Durante una llamada, se le avisa al agente cada vez que te moviste esto. */
export const ANNOUNCE_DISTANCE_M = 150

const CARDINALS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"] as const

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Rumbo inicial de `from` a `to`, en grados desde el norte (sentido horario). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat)
  const φ2 = toRad(to.lat)
  const Δλ = toRad(to.lng - from.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function cardinalEs(degrees: number): (typeof CARDINALS)[number] {
  return CARDINALS[Math.round(degrees / 45) % CARDINALS.length]
}

export function shouldAnnounce(lastAnnounced: LatLng, current: LatLng): boolean {
  return distanceMeters(lastAnnounced, current) >= ANNOUNCE_DISTANCE_M
}

/**
 * Mensaje de sistema que entra a la llamada cuando te movés. No pide respuesta:
 * solo deja asentado el cambio para que el agente busque con la ubicación nueva.
 */
export function locationUpdateText(from: LatLng, to: LatLng): string {
  const meters = distanceMeters(from, to)
  const rounded = meters < 1000 ? Math.round(meters / 50) * 50 : meters
  return (
    `Actualización de ubicación: el viajero se movió unos ${formatDistance(rounded)} hacia el ${cardinalEs(bearingDegrees(from, to))}. ` +
    "Los lugares cercanos cambiaron: para recomendar, llamá de nuevo a recommend_nearby (ya usa la ubicación nueva). No lo menciones salvo que sea útil."
  )
}

/** A esta distancia del destino de show_route, se le avisa al agente que llegó. */
export const ARRIVAL_METERS = 35

/**
 * Mensaje de sistema al llegar al lugar de show_route. Pide respuesta: el agente le
 * avisa que llegó y decide si ofrecerle el traductor.
 */
export function arrivalText({ name }: { name: string }): string {
  return (
    `El viajero llegó a ${name}. Decíselo en una frase corta, sin minutos ni distancias. ` +
    "Si por lo que vino o lo que hablaron va a tener que hablar con alguien ahí (reservar, preguntar un precio, pedir, comprar una entrada), ofrecele ayudarlo con el idioma usando el traductor; si dice que sí, llamá a open_translator. Si no, no lo menciones."
  )
}
