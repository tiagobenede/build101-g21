import "server-only"

/**
 * Frases en voz alta con ElevenLabs ("Decilo por mí"). La voz del sistema suena robótica y
 * distinta en cada teléfono; esta es natural y la misma para todos.
 */
const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
/** Sarah: tiene el francés (y los demás idiomas de la app) verificado en el modelo multilingüe. */
const VOICE_ID = process.env.ELEVENLABS_TTS_VOICE ?? "EXAVITQu4vr4xnSDxMaL"
const MODEL_ID = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2"
/** Traductor: Flash tarda ~75 ms en el modelo (contra ~300 ms) y cuesta la mitad por carácter. */
const FAST_MODEL_ID = process.env.ELEVENLABS_TRANSLATE_MODEL ?? "eleven_flash_v2_5"
const TIMEOUT_MS = 10_000
/** La misma frase no se vuelve a pagar: se guarda el audio (son pocos KB por frase). */
const MAX_CACHED = 200

const cache = new Map<string, ArrayBuffer>()

/** MP3 de la frase, o null si no hay key o falla. `fast`: para el traductor, donde importa la demora. */
export async function speakPhrase(text: string, lang: string, { fast = false } = {}): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return null

  const model = fast ? FAST_MODEL_ID : MODEL_ID
  const key = `${model}|${lang}|${text}`
  const hit = cache.get(key)
  if (hit) return hit

  try {
    const res = await fetch(`${TTS_URL}/${VOICE_ID}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        // "fr-FR" → "fr": que no lo lea con acento de otro idioma.
        language_code: lang.split("-")[0]?.toLowerCase(),
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.9 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const audio = await res.arrayBuffer()
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!)
    cache.set(key, audio)
    return audio
  } catch (err) {
    console.error("[tts]", err instanceof Error ? err.message : err)
    return null
  }
}
