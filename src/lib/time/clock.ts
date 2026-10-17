/**
 * Hora simulada para la demo, como la ubicación simulada: se guarda como una diferencia
 * con la hora real (en ms) en una cookie, así el reloj sigue corriendo y la cookie llega
 * sola al server en cada pedido (pantallas, tools del agente, pings). Sin cookie, hora real.
 */

export const CLOCK_COOKIE = "rumbo_clock"

/** Más de una semana para cualquier lado es un error, no una demo. */
const MAX_OFFSET_MS = 7 * 24 * 60 * 60_000

/** Por debajo de esto es la hora real (el reloj del server y el del cliente difieren un poco). */
const SIMULATED_MIN_MS = 60_000

export function parseClockOffset(raw: string | null | undefined): number {
  const value = Number(raw)
  return raw && Number.isFinite(value) && Math.abs(value) <= MAX_OFFSET_MS ? Math.round(value) : 0
}

export const shiftedNow = (offsetMs: number) => new Date(Date.now() + offsetMs)

/** Si `now` es una hora simulada: entonces no sirve lo que Google dice "abierto ahora". */
export const isSimulated = (now: Date) => Math.abs(now.getTime() - Date.now()) > SIMULATED_MIN_MS
