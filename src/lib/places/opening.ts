/**
 * Cuándo cierra hoy un lugar, a partir del horario de Google ("10:00–18:00",
 * "12:00–14:30, 19:00–23:00", "18:00–2:00"). Puro, para testearlo solo.
 */

export type ClosingInfo = { closesAt: string; closesInMinutes: number }

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** El tramo de hoy que contiene `localTime` (HH:MM) y cuánto falta para que cierre. null si no hay uno. */
export function closingInfo(hoursToday: string | null, localTime: string): ClosingInfo | null {
  const now = toMinutes(localTime)
  if (!hoursToday || now === null) return null
  for (const range of hoursToday.split(",")) {
    const [from, to] = range.split(/[–-]/)
    const start = from ? toMinutes(from) : null
    let end = to ? toMinutes(to) : null
    if (start === null || end === null) continue
    // Pasa la medianoche (18:00–2:00): el cierre es al día siguiente.
    if (end <= start) end += 24 * 60
    const at = now < start && end > 24 * 60 ? now + 24 * 60 : now
    if (at >= start && at < end) return { closesAt: to!.trim(), closesInMinutes: end - at }
  }
  return null
}

/**
 * ¿Conviene recomendarlo ahora? No si está cerrado, ni si cierra antes de que el viajero
 * llegue caminando y termine la visita. Sin datos de horario (lugares semilla, Google sin
 * horario o que no respondió) se lo deja pasar.
 */
export function openLongEnough(
  info: { openNow: boolean | null; hoursToday: string | null } | null,
  localTime: string,
  walkMinutes: number,
  stayMinutes: number
): boolean {
  if (!info) return true
  if (info.openNow === false) return false
  const closing = closingInfo(info.hoursToday, localTime)
  return !closing || walkMinutes + stayMinutes <= closing.closesInMinutes
}

/** Día de la semana en la zona, con lunes = 0 (el orden de `weekdayDescriptions` de Google). */
export function mondayIndex(now: Date, timeZone: string): number {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now)
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day)
}

/** "lunes: 10:00–18:00" → "10:00–18:00" (el horario de ese día sin el nombre). */
export const hoursOfDay = (weekdayDescriptions: readonly string[] | undefined, index: number): string | null =>
  weekdayDescriptions?.[index]?.replace(/^[^:]+:\s*/, "") ?? null

/**
 * Si está abierto a `localTime` según el horario del día ("Cerrado", "Abierto las 24 horas"
 * o tramos). Para la hora simulada, donde el "abierto ahora" de Google no sirve. null si no se sabe.
 */
export function openAt(hoursToday: string | null, localTime: string): boolean | null {
  if (!hoursToday) return null
  if (/cerrado|closed/i.test(hoursToday)) return false
  if (/24 horas|24 hours/i.test(hoursToday)) return true
  return closingInfo(hoursToday, localTime) !== null
}
