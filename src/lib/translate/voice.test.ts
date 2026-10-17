import { describe, expect, it } from "vitest"

import { SentenceSplitter, takeSentences } from "./voice"

describe("takeSentences", () => {
  it("separa las frases completas y deja la que sigue", () => {
    expect(takeSentences("Bonjour. Ça coûte combien? Et pour")).toEqual({
      sentences: ["Bonjour.", "Ça coûte combien?"],
      rest: "Et pour",
    })
  })

  it("no corta en decimales ni sin espacio después del punto", () => {
    expect(takeSentences("Cuesta 3.5 euros. Gracias.")).toEqual({ sentences: ["Cuesta 3.5 euros."], rest: "Gracias." })
  })

  it("incluye comillas y signos que cierran", () => {
    expect(takeSentences('Dijo «hola». Vale!! ').sentences).toEqual(["Dijo «hola».", "Vale!!"])
  })

  it("corta en un espacio un texto largo sin puntos", () => {
    const { sentences, rest } = takeSentences("palabra ".repeat(60))
    expect(sentences.length).toBeGreaterThan(0)
    expect(sentences.every((s) => s.length <= 280)).toBe(true)
    expect(rest.length).toBeLessThanOrEqual(280)
  })
})

describe("SentenceSplitter", () => {
  it("arma frases con deltas sueltos y devuelve el resto al final", () => {
    const s = new SentenceSplitter()
    expect(s.push("Hola, ")).toEqual([])
    expect(s.push("¿cómo estás? Bi")).toEqual(["Hola, ¿cómo estás?"])
    expect(s.push("en")).toEqual([])
    expect(s.flush()).toBe("Bien")
    expect(s.flush()).toBeNull()
  })
})
