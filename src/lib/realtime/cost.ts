import { REALTIME_PRICE_PER_M, type RealtimePrice } from "./config"

/** Shape de `response.usage` en el evento `response.done` de OpenAI Realtime. */
export type RealtimeUsage = {
  input_token_details?: {
    text_tokens?: number
    audio_tokens?: number
    cached_tokens?: number
    cached_tokens_details?: { text_tokens?: number; audio_tokens?: number }
  }
  output_token_details?: { text_tokens?: number; audio_tokens?: number }
}

/** Costo estimado en USD de una respuesta. */
export function estimateUsageCost(usage: RealtimeUsage | undefined, price: RealtimePrice = REALTIME_PRICE_PER_M): number {
  if (!usage) return 0
  const input = usage.input_token_details ?? {}
  const cached = input.cached_tokens_details ?? {}
  const output = usage.output_token_details ?? {}

  const textIn = Math.max(0, (input.text_tokens ?? 0) - (cached.text_tokens ?? 0))
  const audioIn = Math.max(0, (input.audio_tokens ?? 0) - (cached.audio_tokens ?? 0))

  const total =
    textIn * price.text_in +
    audioIn * price.audio_in +
    (input.cached_tokens ?? 0) * price.cached_in +
    (output.text_tokens ?? 0) * price.text_out +
    (output.audio_tokens ?? 0) * price.audio_out

  return total / 1_000_000
}
