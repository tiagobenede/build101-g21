/**
 * Voz de la traducción con ElevenLabs en vez del audio de `gpt-realtime-translate` (que no
 * deja elegir voz: imita la de quien habla). Del modelo se usa solo el texto traducido, que
 * se corta en frases y se lee de a una, en orden.
 */

/** Cuánto esperar a que el navegador deje sonar el audio. */
const RESUME_WAIT_MS = 1_500

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
 *
 * Suena por Web Audio y no con un `<audio>`: en iPhone, un `<audio>` que suena mientras el
 * micrófono está abierto deja el mic "vivo" pero mandando silencio, y el turno siguiente no
 * se traduce. El `AudioContext` se crea y se destraba con `unlock()` en el toque del botón
 * (Safari no deja sonar un contexto creado fuera de un toque).
 */
export class VoiceQueue {
  private queue: Promise<void> = Promise.resolve()
  private ctx: AudioContext | null = null
  private playing: AudioBufferSourceNode | null = null
  private generation = 0

  constructor(private readonly onError?: (err: unknown) => void) {}

  /** Llamar dentro del toque de un botón (antes de cualquier `await`). */
  unlock() {
    this.ctx ??= new AudioContext()
    void this.ctx.resume().catch(() => undefined)
  }

  say(text: string, lang: string) {
    const generation = this.generation
    const audio = fetchAudio(text, lang)
    this.queue = this.queue.then(async () => {
      const data = await audio.catch((err) => {
        this.onError?.(err)
        return null
      })
      if (!data || generation !== this.generation) return
      await this.play(data).catch((err) => this.onError?.(err))
    })
  }

  /** Corta lo que suena y descarta lo pendiente. */
  stop() {
    this.generation++
    try {
      this.playing?.stop()
    } catch {
      // Ya había terminado.
    }
  }

  /** Suelta el contexto de audio (al cerrar el traductor). */
  close() {
    this.stop()
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }

  private async play(data: ArrayBuffer) {
    this.unlock()
    const ctx = this.ctx!
    // Sin un toque antes, el navegador puede no dejar sonar: no trabar la cola esperando.
    if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, RESUME_WAIT_MS))])
    if (ctx.state !== "running") throw new Error("El navegador no deja reproducir audio todavía.")
    const buffer = await ctx.decodeAudioData(data)
    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      this.playing = source
      source.onended = () => {
        if (this.playing === source) this.playing = null
        resolve()
      }
      source.start()
    })
  }
}

async function fetchAudio(text: string, lang: string): Promise<ArrayBuffer> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, kind: "translation" }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  return res.arrayBuffer()
}
