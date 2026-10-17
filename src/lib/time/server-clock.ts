import "server-only"

import { cookies } from "next/headers"

import { CLOCK_COOKIE, parseClockOffset, shiftedNow } from "./clock"

/**
 * "Ahora" del viajero en el server: la hora simulada si eligió una (ver clock.ts), si no
 * la real. Fuera de un pedido (pruebas, tareas sueltas) no hay cookies: hora real.
 */
export async function serverNow(): Promise<Date> {
  try {
    const jar = await cookies()
    return shiftedNow(parseClockOffset(jar.get(CLOCK_COOKIE)?.value))
  } catch {
    return new Date()
  }
}
