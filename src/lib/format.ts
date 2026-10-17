export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso))
}
