import { describe, expect, it } from "vitest"

import { UtteranceBuilder } from "./utterances"

describe("UtteranceBuilder", () => {
  it("junta original y traducción del turno, aunque lleguen a destiempo", () => {
    const b = new UtteranceBuilder("them", "t")
    b.add("input", "Essayez le couscous, il ")
    b.add("output", "Prueba el cuscús, ")
    const current = b.add("input", "est excellent.")
    expect(current).toEqual({ id: "t", speaker: "them", original: "Essayez le couscous, il est excellent.", translated: "Prueba el cuscús, ", final: false })
  })

  it("finish cierra una sola vez y recorta", () => {
    const b = new UtteranceBuilder("me", "m")
    b.add("input", " Hola ")
    b.add("output", "Bonjour ")
    expect(b.finish()).toEqual({ id: "m", speaker: "me", original: "Hola", translated: "Bonjour", final: true })
    expect(b.finish()).toBeNull()
  })

  it("sin texto no devuelve nada", () => {
    const b = new UtteranceBuilder("me", "m")
    b.add("output", "  ")
    expect(b.finish()).toBeNull()
  })
})
