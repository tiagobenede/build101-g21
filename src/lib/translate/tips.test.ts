import { describe, expect, it } from "vitest"

import { buildTipsPrompt, keepTips, tipsJsonSchema, type ExtractedTip } from "./tips"

const tip = (over: Partial<ExtractedTip>): ExtractedTip => ({
  place_name: "Marché des Enfants Rouges",
  search_query: "Marché des Enfants Rouges Paris",
  what: "Comer el cuscús",
  why: null,
  when_to_go: null,
  price_hint: null,
  recommender: null,
  original_quote: "Essayez le couscous",
  translated_quote: "Probá el cuscús",
  confidence: 0.9,
  ...over,
})

describe("buildTipsPrompt", () => {
  it("marca quién habla y suma la traducción", () => {
    const prompt = buildTipsPrompt(
      [
        { speaker: "me", original: "¿Dónde como?", translated: "Où manger ?" },
        { speaker: "them", original: "Allez au marché", translated: "Andá al mercado" },
        { speaker: "them", original: "", translated: "Solo traducción" },
      ],
      "París"
    )
    expect(prompt).toBe(
      "Ciudad: París\n\nViajero: ¿Dónde como? (traducido: Où manger ?)\nLocal: Allez au marché (traducido: Andá al mercado)\nLocal: Solo traducción"
    )
  })
})

describe("keepTips", () => {
  it("saca las dudosas o sin nombre y deja hasta 3", () => {
    const kept = keepTips([
      tip({ place_name: " " }),
      tip({ confidence: 0.3 }),
      tip({ place_name: "Café B" }),
      tip({ place_name: "Café C" }),
      tip({ place_name: "Café D" }),
      tip({ place_name: "Café E" }),
    ])
    expect(kept.map((t) => t.place_name)).toEqual(["Café B", "Café C", "Café D"])
  })
})

describe("tipsJsonSchema", () => {
  it("es un objeto sin $schema, con todos los campos requeridos", () => {
    const schema = tipsJsonSchema() as { $schema?: string; properties: { tips: { items: { required: string[] } } } }
    expect(schema.$schema).toBeUndefined()
    expect(schema.properties.tips.items.required).toContain("why")
  })
})
