import { describe, expect, it } from "vitest"

import { extractionSchema, formatTranscript, hasLocalSpeech, MAX_TRANSCRIPT_CHARS, type TranslationMessage } from "./transcript"

const msg = (role: TranslationMessage["role"], content: string, translated: string | null = null, lang: string | null = null): TranslationMessage => ({
  role,
  content,
  translated_text: translated,
  lang,
})

describe("formatTranscript", () => {
  it("marca quién habla y pone el original y la traducción", () => {
    const text = formatTranscript([
      msg("user", "¿Dónde como bien?", "Où est-ce que je mange bien ?", "es"),
      msg("local", "Allez au Breizh Café.", "Vayan al Brest Café.", "fr"),
    ])
    expect(text).toBe(
      "VIAJERO (es): ¿Dónde como bien?\n  traducción: Où est-ce que je mange bien ?\nRESIDENTE (fr): Allez au Breizh Café.\n  traducción: Vayan al Brest Café."
    )
  })

  it("no repite la traducción si es igual y saltea frases vacías", () => {
    expect(formatTranscript([msg("local", "Merci", "Merci"), msg("user", "  ")])).toBe("RESIDENTE: Merci")
  })

  it("si es muy larga se queda con el final", () => {
    const long = Array.from({ length: 400 }, (_, i) => msg("local", `frase ${i} ${"x".repeat(50)}`))
    const text = formatTranscript(long)
    expect(text.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS)
    expect(text).toContain("frase 399")
    expect(text).not.toContain("frase 0 ")
  })
})

describe("hasLocalSpeech", () => {
  it("solo hay algo que extraer si habló el residente", () => {
    expect(hasLocalSpeech([msg("user", "hola")])).toBe(false)
    expect(hasLocalSpeech([msg("user", "hola"), msg("local", "bonjour")])).toBe(true)
  })
})

describe("extractionSchema", () => {
  it("normaliza textos vacíos a null", () => {
    const parsed = extractionSchema.parse({
      tips: [
        {
          place_name: " Breizh Café ",
          what: "Crêpes",
          why: "  ",
          when_to_go: null,
          price_hint: "15 €",
          recommender: "",
          original_quote: "Allez au Breizh Café",
          translated_quote: null,
          confidence: 0.9,
        },
      ],
    })
    expect(parsed.tips[0]).toMatchObject({ place_name: "Breizh Café", why: null, recommender: null, price_hint: "15 €" })
  })
})
