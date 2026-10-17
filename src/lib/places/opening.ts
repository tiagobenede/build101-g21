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
