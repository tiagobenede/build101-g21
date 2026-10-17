/**
 * Traductor cara a cara con `gpt-realtime-translate`. Se cobra cada minuto que una
 * sesión está abierta, con silencio incluido: por eso hay una sola por vez y solo
 * mientras alguien habla (ver `docs/realtime-mock/README.md`).
 */

export const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL ?? "gpt-realtime-translate"
/** Transcribe lo que se dijo en el idioma original (el modelo solo da la traducción). */
export const INPUT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper"
export const TRANSLATE_KEY_TTL_SECONDS = 60
/**
 * Quién pone la voz: ElevenLabs lee el texto traducido (voz fija, natural) u OpenAI con su
 * propio audio (más rápido, pero imita la voz de quien habla). `openai` para comparar.
 */
export const TRANSLATE_VOICE: "elevenlabs" | "openai" = process.env.NEXT_PUBLIC_TRANSLATE_VOICE === "openai" ? "openai" : "elevenlabs"
/** Si el modelo deja de traducir este tiempo, se lee lo que quedó sin punto final. */
export const SPEAK_QUIET_MS = 800

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

/** Idioma principal de cada país, para los que ofrece la pantalla (ISO 3166-1 alfa-2). */
const COUNTRY_LANG: Record<string, Lang> = {
  FR: "fr", BE: "fr", MC: "fr", LU: "fr", CH: "fr", SN: "fr", CI: "fr", MA: "fr", TN: "fr",
  IT: "it", SM: "it", VA: "it",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
  DE: "de", AT: "de", LI: "de",
  ES: "es", MX: "es", AR: "es", UY: "es", CL: "es", CO: "es", PE: "es", BO: "es", PY: "es", EC: "es", VE: "es",
  CR: "es", PA: "es", GT: "es", HN: "es", SV: "es", NI: "es", DO: "es", CU: "es", PR: "es",
}

/** Idioma principal del país, si es uno de los que ofrece la pantalla. */
export function countryLanguage(countryCode: string | null): Lang | null {
  return (countryCode && COUNTRY_LANG[countryCode.toUpperCase()]) || null
}

/**
 * Idioma de la persona del lugar según el país donde está el viajero. Si es el mismo que el
 * suyo o no lo conocemos, inglés: lo más probable para entenderse.
 */
export function localLanguage(countryCode: string | null, myLang: Lang): Lang {
  const lang = countryLanguage(countryCode)
  if (lang && lang !== myLang) return lang
  return myLang === "en" ? "es" : "en"
}

/** Quién habla: el viajero o la persona del lugar. */
export type Speaker = "me" | "them"

/** Al soltar el botón, se espera esto (que salga el audio de las últimas palabras) y se cierra. */
export const RELEASE_TAIL_MS = 1_500
/** Si nadie habla en un minuto, se suelta solo (sigue cobrando aunque haya silencio). */
export const ACTIVE_MAX_MS = 60_000
/** US$ por minuto abierto (precio de lista, sin la transcripción). */
export const TRANSLATE_USD_PER_MINUTE = 0.034
