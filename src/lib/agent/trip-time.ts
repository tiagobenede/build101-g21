/**
 * El agente habla en hora local del viaje ("a las 16:00", "mañana"); la base guarda
 * instantes. Esto convierte sin depender de la zona horaria del server.
 */

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha local (YYYY-MM-DD) en la zona del viaje. */
export const tripDate = (instant: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(instant)

/** Minutos que la zona está adelantada respecto de UTC en ese instante. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

/**
 * "16:00" (y opcionalmente "2026-10-18") en la zona del viaje → ISO UTC.
 * Sin fecha es hoy. null si el formato no es válido.
 */
export function tripTimeToIso(time: string, date: string | null, now: Date, timeZone: string): string | null {
  const t = TIME_RE.exec(time.trim())
  const day = date ?? tripDate(now, timeZone)
  if (!t || !DATE_RE.test(day)) return null
  const [y, m, d] = day.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d, Number(t[1]), Number(t[2]))
  // Dos pasadas por si el cambio de horario cae entre medio.
  let instant = guess - offsetMinutes(new Date(guess), timeZone) * 60_000
  instant = guess - offsetMinutes(new Date(instant), timeZone) * 60_000
  return new Date(instant).toISOString()
}
