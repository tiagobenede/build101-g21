import { TRIP_TIME_ZONE } from "@/lib/config"

export function formatTime(iso: string, timeZone: string = TRIP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso))
}

export function tripDay(startDate: string, endDate: string, now: Date = new Date()): { day: number; total: number } {
  const DAY_MS = 86_400_000
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const total = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
  const day = Math.min(total, Math.max(1, Math.floor((now.getTime() - start.getTime()) / DAY_MS) + 1))
  return { day, total }
}
