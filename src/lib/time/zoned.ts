/**
 * Horas del itinerario en la zona del viaje (París), sin librerías: Intl alcanza.
 */

const parts = (date: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  )

/** Diferencia en minutos entre la zona y UTC en ese instante (París: +60 o +120). */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone)
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/** "YYYY-MM-DD" del día en la zona dada. */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}

/** "HH:MM" de un instante ISO en la zona dada (para un <input type="time">). */
export function zonedTimeValue(iso: string, timeZone: string): string {
  const p = parts(new Date(iso), timeZone)
  return `${p.hour}:${p.minute}`
}

/** Fecha "YYYY-MM-DD" + hora "HH:MM" (o "H:MM", como la dice el agente) en la zona → instante ISO (UTC). */
export function zonedTimeToIso(dateKey: string, time: string, timeZone: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  const [y, m, d] = dateKey.split("-").map(Number)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || !y || !m || !d) {
    throw new Error(`Hora inválida: ${time}`)
  }
  const guess = Date.UTC(y, m - 1, d, Number(match[1]), Number(match[2]))
  // Restar el offset de la zona; se recalcula una vez por si cruza un cambio de horario.
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000
  const exact = guess - offsetMinutes(new Date(first), timeZone) * 60_000
  return new Date(exact).toISOString()
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}
