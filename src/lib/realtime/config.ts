/**
 * Configuración de la voz real (OpenAI Realtime), afinada para gastar lo mínimo en pruebas.
 * Ver docs/realtime-mock/COMPARISON.md para la comparación de costos.
 */
export const REALTIME_MODEL = process.env.REALTIME_MODEL ?? "gpt-realtime-2.1-mini"
export const REALTIME_VOICE = process.env.VOICE ?? "marin"

/** Tope de tokens de salida por respuesta (~1.200 tokens de audio = 1 min de voz). */
export const MAX_OUTPUT_TOKENS = 500

/** La key efímera solo sirve para abrir la conexión en este plazo. */
export const EPHEMERAL_KEY_TTL_SECONDS = 60

/** Cantidad de lugares cercanos que van en las instrucciones (más = más tokens por turno). */
export const MAX_PLACES_IN_CONTEXT = 8

/** Actividades de hoy que van en las instrucciones. */
export const MAX_ITINERARY_IN_CONTEXT = 8

/**
 * Detección de turnos del servidor: el modelo responde cuando dejás de hablar y
 * se corta solo si lo interrumpís. Solo se factura el audio que el VAD detecta como voz.
 */
export const TURN_DETECTION = {
  type: "server_vad",
  threshold: 0.6,
  prefix_padding_ms: 300,
  silence_duration_ms: 500,
  create_response: true,
  interrupt_response: true,
} as const

/**
 * Refresco del contexto con la llamada abierta (`session.update`): al moverte esta
 * distancia o al cambiar el itinerario, y no más seguido que esto (cada refresco
 * hace que la siguiente respuesta relea las instrucciones sin cache).
 */
export const CONTEXT_REFRESH_DISTANCE_M = 300
export const CONTEXT_REFRESH_MIN_MS = 30_000

/** Un tool que tarda más que esto devuelve error y la charla sigue. */
export const TOOL_TIMEOUT_MS = 12_000

/** Límites del lado del cliente. */
export const SESSION_IDLE_MS = 60_000
export const SESSION_BUDGET_USD = 0.3

/**
 * Precios por 1M tokens. Estimados de la familia realtime-mini: verificarlos en
 * https://openai.com/api/pricing antes de usarlos para algo más que el medidor de la demo.
 */
export type RealtimePrice = Record<"text_in" | "audio_in" | "cached_in" | "text_out" | "audio_out", number>

export const REALTIME_PRICE_PER_M: RealtimePrice = {
  text_in: 0.6,
  audio_in: 10,
  cached_in: 0.06,
  text_out: 2.4,
  audio_out: 20,
}
