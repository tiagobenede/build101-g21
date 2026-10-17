import { describe, expect, it } from "vitest"

import { isRecent, messagesToTurns, recentTranslationLine, theirLanguage, transcriptText, type RecentTranslation } from "./recent"

const now = new Date("2026-10-17T12:00:00Z")
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

describe("messagesToTurns", () => {
  it("separa original y traducción según haya idioma", () => {
    const turns = messagesToTurns([
      { role: "user", lang: "es", content: "¿Dónde como?", translated_text: "Où manger ?" },
      { role: "local", lang: "fr", content: "Allez au marché", translated_text: null },
      { role: "local", lang: null, content: "Solo traducción", translated_text: "Solo traducción" },
    ])
    expect(turns).toEqual([
      { speaker: "me", original: "¿Dónde como?", translated: "Où manger ?" },
      { speaker: "them", original: "Allez au marché", translated: "" },
      { speaker: "them", original: "", translated: "Solo traducción" },
    ])
    expect(transcriptText(turns)).toBe("Viajero: ¿Dónde como? (traducido: Où manger ?)\nLocal: Allez au marché\nLocal: Solo traducción")
  })
})

describe("isRecent", () => {
  it("vale hasta 5 minutos después", () => {
    expect(isRecent(minutesAgo(0), now)).toBe(true)
    expect(isRecent(minutesAgo(5), now)).toBe(true)
    expect(isRecent(minutesAgo(5.1), now)).toBe(false)
    expect(isRecent(new Date(now.getTime() + 1_000), now)).toBe(false)
  })
})

describe("recentTranslationLine", () => {
  const base: RecentTranslation = {
    id: "c1",
    langPair: "es-fr",
    summary: null,
    turns: Array.from({ length: 8 }, (_, i) => ({ speaker: "them" as const, original: `frase ${i + 1}`, translated: "" })),
    finishedAt: minutesAgo(3),
  }

  it("usa el resumen si ya está", () => {
    const line = recentTranslationLine({ ...base, summary: "Camille le recomendó el Marché des Enfants Rouges." }, now)
    expect(line).toContain("Hace 3 minutos")
    expect(line).toContain("(en Français)")
    expect(line).toContain("Resumen: Camille le recomendó el Marché des Enfants Rouges.")
    expect(line).toContain("translation_transcript")
  })

  it("sin resumen, pasa las últimas frases", () => {
    const line = recentTranslationLine({ ...base, finishedAt: minutesAgo(0) }, now)
    expect(line.startsWith("Recién")).toBe(true)
    expect(line).not.toContain("frase 2\n")
    expect(line).toContain("Local: frase 3")
    expect(line).toContain("Local: frase 8")
  })

  it("idioma de la persona local", () => {
    expect(theirLanguage("es-it")).toBe("Italiano")
    expect(theirLanguage(null)).toBeNull()
    expect(theirLanguage("es-xx")).toBeNull()
  })
})
