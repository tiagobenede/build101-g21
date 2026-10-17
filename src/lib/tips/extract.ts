import "server-only"

import { callStructured } from "@/lib/llm/structured"

import { extractionSchema, EXTRACTION_JSON_SCHEMA, formatTranscript, type ExtractedTip, type TranslationMessage } from "./transcript"

/** Mismo modelo que la visión: barato y con salida estructurada. */
const TIPS_MODEL = process.env.TIPS_MODEL ?? "gpt-5.6-luna"
const TIMEOUT_MS = 20_000
/** Por debajo de esto no es una recomendación (lo mencionó al pasar, o el modelo duda). */
export const MIN_TIP_CONFIDENCE = 0.5

const INSTRUCTIONS = `Leés la transcripción de una charla traducida entre un VIAJERO y un RESIDENTE de la ciudad.
Extraé solo los lugares concretos (un comercio, un mercado, una plaza, un museo…) que el RESIDENTE le recomienda al viajero.
- No incluyas lugares que nombra el viajero, salvo que el residente los recomiende.
- No incluyas recomendaciones genéricas sin un lugar concreto ("comé crêpes").
- place_name: el nombre propio como figura en el ORIGINAL del residente. La traducción automática deforma los nombres propios ("Breizh Café" → "Brest Café"): no la uses para el nombre.
- what, why, when_to_go y price_hint en español rioplatense, cortos.
- Si no hay recomendaciones, devolvé una lista vacía.`

/** Lugares que recomendó el residente en la charla (los dudosos se descartan). */
export async function extractTips(messages: readonly TranslationMessage[]): Promise<ExtractedTip[]> {
  const transcript = formatTranscript(messages)
  if (!transcript) return []

  const answer = await callStructured({
    model: TIPS_MODEL,
    effort: "low",
    instructions: INSTRUCTIONS,
    content: [{ type: "input_text", text: transcript }],
    schemaName: "recomendaciones",
    schema: EXTRACTION_JSON_SCHEMA,
    maxOutputTokens: 1_500,
    timeoutMs: TIMEOUT_MS,
  })
  return extractionSchema.parse(answer).tips.filter((t) => t.confidence >= MIN_TIP_CONFIDENCE)
}
