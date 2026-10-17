/**
 * Voz de la traducción con ElevenLabs en vez del audio de `gpt-realtime-translate` (que no
 * deja elegir voz: imita la de quien habla). Del modelo se usa solo el texto traducido, que
 * se corta en frases y se lee de a una, en orden.
 */

/** Tope de `/api/tts`; un texto sin puntos se corta antes en un espacio. */
const MAX_CHUNK = 280
/** Fin de frase: puntuación (y comillas o paréntesis que cierran) seguida de un espacio; "3.5" no corta. */
const SENTENCE = /[\s\S]*?[.!?…]+["'»”’)\]]*\s+/y

/** Saca las frases completas del texto; lo que no terminó espera más palabras. */
export function takeSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  SENTENCE.lastIndex = 0
  let end = 0
  for (let m = SENTENCE.exec(text); m; m = SENTENCE.exec(text)) {
    const s = m[0].trim()
    if (s) sentences.push(s)
    end = SENTENCE.lastIndex
  }
  let rest = text.slice(end)
  while (rest.length > MAX_CHUNK) {
    const cut = rest.lastIndexOf(" ", MAX_CHUNK)
    const at = cut > 0 ? cut : MAX_CHUNK
    sentences.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trimStart()
  }
  return { sentences, rest }
}

/** Junta los deltas de la traducción de un turno y devuelve lo que ya se puede leer. */
export class SentenceSplitter {
  private buffer = ""

  push(delta: string): string[] {
    const { sentences, rest } = takeSentences(this.buffer + delta)
    this.buffer = rest
    return sentences
  }

  /** Lo que quedó sin punto final (al callarse el modelo o cerrar el turno). */
  flush(): string | null {
    const text = this.buffer.trim()
    this.buffer = ""
    return text || null
  }
}

/**
 * Lee frases de a una y en orden, aunque vengan de los dos lados: el audio se pide apenas
 * llega la frase (así la siguiente ya está lista) y se reproduce cuando termina la anterior.
 */
export class VoiceQueue {
  private queue: Promise<void> = Promise.resolve()
  private playing: HTMLAudioElement | null = null
  private generation = 0

  constructor(private readonly onError?: (err: unknown) => void) {}

  say(text: string, lang: string) {
    const generation = this.generation
    const audio = fetchAudio(text, lang)
    this.queue = this.queue.then(async () => {
      const url = await audio.catch((err) => {
        this.onError?.(err)
        return null
      })
      if (!url) return
      if (generation === this.generation) await this.play(url)
      URL.revokeObjectURL(url)
    })
  }

  /** Corta lo que suena y descarta lo pendiente. */
  stop() {
    this.generation++
    this.playing?.pause()
    this.playing?.dispatchEvent(new Event("ended"))
  }

  private play(url: string) {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url)
      this.playing = audio
      const done = () => {
        if (this.playing === audio) this.playing = null
        resolve()
      }
      audio.onended = done
      audio.onerror = done
      audio.play().catch(done)
    })
  }
}

async function fetchAudio(text: string, lang: string): Promise<string> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, kind: "translation" }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return URL.createObjectURL(await res.blob())
}
