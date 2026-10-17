import { describe, expect, it } from "vitest"

import { localLanguage } from "./config"

describe("localLanguage", () => {
  it("el idioma del país donde está", () => {
    expect(localLanguage("FR", "es")).toBe("fr")
    expect(localLanguage("it", "es")).toBe("it")
    expect(localLanguage("BR", "es")).toBe("pt")
  })

  it("inglés si el país habla lo mismo que el viajero o no lo conocemos", () => {
    expect(localLanguage("AR", "es")).toBe("en")
    expect(localLanguage("JP", "es")).toBe("en")
    expect(localLanguage(null, "es")).toBe("en")
  })

  it("si el viajero habla inglés y no sabemos, español", () => {
    expect(localLanguage("JP", "en")).toBe("es")
  })
})
