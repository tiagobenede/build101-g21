import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { namesMatch } = await import("./lookup")

describe("namesMatch", () => {
  it("tolera palabras de más o de menos y los acentos", () => {
    expect(namesMatch("Marché couvert des Enfants Rouges", "Marche des Enfants Rouges")).toBe(true)
    expect(namesMatch("Museo Carnavalet", "el Carnavalet")).toBe(true)
  })

  it("no confunde lugares distintos", () => {
    expect(namesMatch("Museo del Louvre", "Museo Picasso")).toBe(false)
  })
})
