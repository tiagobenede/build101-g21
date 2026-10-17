import "server-only"

/**
 * Modelo que escribe la UI. Por defecto gpt-6-luna: en nuestro benchmark (4 pantallas
 * reales, 3 rondas) armó 12/12 bien, ~0,9 s a la primera línea y ~US$0,0002 por
 * pantalla (US$0,10 / 0,50 por millón de tokens). Groq queda como opción si hay key.
 * Los dos hablan la API de chat de OpenAI.
 */
export type GenUiProvider = {
  name: "groq" | "openai"
  baseUrl: string
  apiKey: string
  model: string
  /** Los modelos de razonamiento piensan antes de responder: para UI no hace falta. */
  reasoningEffort: "none" | null
}

export function genUiProvider(): GenUiProvider | null {
  if (process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GENUI_MODEL ?? "llama-3.3-70b-versatile",
      reasoningEffort: null,
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.GENUI_MODEL ?? "gpt-6-luna",
      reasoningEffort: (process.env.GENUI_MODEL ?? "gpt-6-luna").startsWith("gpt-4") ? null : "none",
    }
  }
  return null
}

/** Tope de salida: una pantalla son ~150–600 tokens de OpenUI Lang. */
export const GENUI_MAX_TOKENS = 700

type ChatChunk = { choices?: { delta?: { content?: string | null } }[] }

/** Pide la pantalla en streaming y devuelve solo el texto que va llegando. */
export async function* streamCompletion(
  provider: GenUiProvider,
  system: string,
  user: string,
  signal: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      temperature: 0.2,
      max_completion_tokens: GENUI_MAX_TOKENS,
      ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`${provider.name} respondió ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : ""
      if (!data || data === "[DONE]") continue
      try {
        const delta = (JSON.parse(data) as ChatChunk).choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // Línea SSE incompleta o de control: se ignora.
      }
    }
  }
}
