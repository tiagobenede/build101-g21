/**
 * La charla con el traductor que acaba de terminar: si el viajero vuelve a hablar con
 * el agente al rato, el agente arranca sabiendo de qué se habló (resumen en las
 * instrucciones y la charla entera con `translation_transcript`).
 * Lo puro se testea solo; la consulta y el modelo están en `server.ts`.
 */
import { LANGUAGES, type Lang } from "./config"
import { turnLine, type Turn } from "./tips"

/** Hasta cuánto después de la última frase traducida el agente la tiene presente. */
export const RECENT_TRANSLATION_MINUTES = 5
/** Sin resumen todavía (se está armando), las últimas frases van tal cual. */
const FALLBACK_LINES = 6

export type TranslationMessage = { role: string; lang: string | null; content: string; translated_text: string | null }

export type RecentTranslation = {
  id: string
  /** "es-fr": el idioma del viajero y el de la persona local. */
  langPair: string | null
  summary: string | null
  turns: Turn[]
  /** Cuándo terminó: al cerrar el traductor, o la última frase si no llegó a cerrarse. */
  finishedAt: Date
}

/** `messages` → turnos. Si no hubo transcripción del original, `lang` es null y `content` es la traducción. */
export function messagesToTurns(messages: TranslationMessage[]): Turn[] {
  return messages.map((m) => ({
    speaker: m.role === "local" ? "them" : "me",
    original: m.lang ? m.content : "",
    translated: m.lang ? (m.translated_text ?? "") : m.content,
  }))
}

export const transcriptText = (turns: Turn[]) => turns.map(turnLine).join("\n")

export function isRecent(finishedAt: Date, now: Date): boolean {
  const ms = now.getTime() - finishedAt.getTime()
  return ms >= 0 && ms <= RECENT_TRANSLATION_MINUTES * 60_000
}

/** "Francés" para "es-fr" (el idioma de la persona local), o null. */
export function theirLanguage(langPair: string | null): string | null {
  const theirs = langPair?.split("-")[1]
  return theirs && theirs in LANGUAGES ? LANGUAGES[theirs as Lang] : null
}

/** Para las instrucciones: qué se habló hace un rato con alguien del lugar. */
export function recentTranslationLine(t: RecentTranslation, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - t.finishedAt.getTime()) / 60_000))
  const when = minutes <= 1 ? "Recién" : `Hace ${minutes} minutos`
  const lang = theirLanguage(t.langPair)
  const about = t.summary
    ? `Resumen: ${t.summary}`
    : `Las últimas frases:\n${transcriptText(t.turns.slice(-FALLBACK_LINES))}`
  return `${when}, con el traductor, el viajero habló con una persona local${lang ? ` (en ${lang})` : ""}. ${about}
Si retoma esa charla ("¿qué me dijo?", "lo que me recomendó", "¿cómo se llamaba?"), usá lo que sabés; si necesitás lo que se dijo exactamente, llamá a translation_transcript.`
}

export const SUMMARY_SYSTEM_PROMPT = `Sos parte de Polo, un guía de viaje. Un viajero habló con una persona local a través de un traductor; te paso la charla.
Resumila en español rioplatense en 2 a 4 oraciones (máx. 80 palabras): con quién habló (si se presentó), qué preguntó el viajero y qué le respondió o recomendó la persona local, con los nombres propios de lugares, horarios y precios tal como se dijeron. Sin introducciones ni opiniones; si quedó algo pendiente (una cita, un pedido), decilo.`
