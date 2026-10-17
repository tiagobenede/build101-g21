/**
 * Traductor cara a cara con `gpt-realtime-translate`. Se cobra cada minuto que una
 * sesión está abierta, con silencio incluido: por eso hay una sola por vez y solo
 * mientras alguien habla (ver `docs/realtime-mock/README.md`).
 */

export const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL ?? "gpt-realtime-translate"
/** Transcribe lo que se dijo en el idioma original (el modelo solo da la traducción). */
export const INPUT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper"
export const TRANSLATE_KEY_TTL_SECONDS = 60

/** Idiomas que ofrece la pantalla (la API acepta muchos más). */
export const LANGUAGES = {
  es: "Español",
  fr: "Français",
  en: "English",
  it: "Italiano",
  pt: "Português",
  de: "Deutsch",
} as const
export type Lang = keyof typeof LANGUAGES
export const LANG_CODES = Object.keys(LANGUAGES) as [Lang, ...Lang[]]

/** Quién habla: el viajero o la persona del lugar. */
export type Speaker = "me" | "them"

/** Al soltar el botón, se cierra la sesión este tiempo después de las últimas palabras traducidas. */
export const FLUSH_QUIET_MS = 2_500
/** Nunca esperar más que esto después de soltar. */
export const FLUSH_MAX_MS = 10_000
/** Si nadie habla en un minuto, se suelta solo (sigue cobrando aunque haya silencio). */
export const ACTIVE_MAX_MS = 60_000
/** US$ por minuto abierto (precio de lista, sin la transcripción). */
export const TRANSLATE_USD_PER_MINUTE = 0.034
