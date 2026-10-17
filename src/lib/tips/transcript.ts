import { z } from "zod"

/** Frase de una conversación de traducción, como la guarda `/api/translate/messages`. */
export type TranslationMessage = {
  role: "user" | "agent" | "local"
  /** Lo que se dijo, en el idioma original (o la traducción si no hubo transcripción). */
  content: string
  translated_text: string | null
  lang: string | null
}

/** El modelo lee la charla entera en cada extracción: más que esto no aporta y cuesta. */
export const MAX_TRANSCRIPT_CHARS = 12_000

/**
 * Charla en texto para el modelo: cada frase con quién habló, el original y la
 * traducción. Si es muy larga, se queda con el final.
 */
export function formatTranscript(messages: readonly TranslationMessage[]): string {
  const lines = messages
    .filter((m) => m.role !== "agent" && m.content.trim())
    .map((m) => {
      const who = m.role === "local" ? "RESIDENTE" : "VIAJERO"
      const original = `${who}${m.lang ? ` (${m.lang})` : ""}: ${m.content.trim()}`
      const translated = m.translated_text?.trim()
      return translated && translated !== m.content.trim() ? `${original}\n  traducción: ${translated}` : original
    })

  let text = lines.join("\n")
  while (text.length > MAX_TRANSCRIPT_CHARS && lines.length > 1) {
    lines.shift()
    text = lines.join("\n")
  }
  return text
}

/** Hay algo que extraer solo si habló el residente. */
export const hasLocalSpeech = (messages: readonly TranslationMessage[]) =>
  messages.some((m) => m.role === "local" && m.content.trim().length > 0)

const nullableText = z
  .string()
  .nullable()
  .transform((s) => s?.trim() || null)

export const extractedTipSchema = z.object({
  place_name: z.string().trim().min(1),
  what: z.string().trim().min(1),
  why: nullableText,
  when_to_go: nullableText,
  price_hint: nullableText,
  recommender: nullableText,
  original_quote: nullableText,
  translated_quote: nullableText,
  confidence: z.number().min(0).max(1),
})

export type ExtractedTip = z.infer<typeof extractedTipSchema>

export const extractionSchema = z.object({ tips: z.array(extractedTipSchema) })

/** Mismo esquema en JSON Schema para la salida estructurada (strict: todo en `required`). */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tips"],
  properties: {
    tips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "place_name",
          "what",
          "why",
          "when_to_go",
          "price_hint",
          "recommender",
          "original_quote",
          "translated_quote",
          "confidence",
        ],
        properties: {
          place_name: {
            type: "string",
            description: "Nombre propio del lugar tal como aparece en el ORIGINAL del residente (la traducción deforma los nombres).",
          },
          what: { type: "string", description: "Qué es o qué hacer ahí, en español, una frase corta." },
          why: { type: ["string", "null"], description: "Por qué lo recomienda, en español." },
          when_to_go: { type: ["string", "null"], description: "Cuándo ir, si lo dijo." },
          price_hint: { type: ["string", "null"], description: "Precio aproximado, si lo dijo." },
          recommender: {
            type: ["string", "null"],
            description: "Quién lo recomienda, si se presentó o se nota (\"Camille, la de la panadería\"). null si no se sabe.",
          },
          original_quote: { type: ["string", "null"], description: "La frase del residente en el idioma original." },
          translated_quote: { type: ["string", "null"], description: "La misma frase traducida, como figura en la charla." },
          confidence: { type: "number", description: "0 a 1: qué tan seguro es que el residente recomienda este lugar concreto." },
        },
      },
    },
  },
} as const
