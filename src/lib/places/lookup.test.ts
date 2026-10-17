import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { namesMatch, sameName } = await import("./lookup")

describe("namesMatch", () => {
  it("tolera palabras de más o de menos y los acentos", () => {
    expect(namesMatch("Marché couvert des Enfants Rouges", "Marche des Enfants Rouges")).toBe(true)
    expect(namesMatch("Museo Carnavalet", "el Carnavalet")).toBe(true)
  })

  it("no confunde lugares distintos", () => {
    expect(namesMatch("Museo del Louvre", "Museo Picasso")).toBe(false)
    expect(namesMatch("Centre Pompidou", "Place Georges Pompidou")).toBe(false)
  })

  it("el nombre en francés encuentra el de Google en castellano", () => {
    expect(namesMatch("Centre Pompidou", "Centro Nacional de Arte y Cultura Georges Pompidou")).toBe(true)
    expect(namesMatch("Musée du Louvre", "Museo del Louvre")).toBe(true)
  })
})

describe("sameName", () => {
  it("no acepta palabras de más", () => {
    expect(sameName("Torre Eiffel", "Torre Eiffel")).toBe(true)
    expect(sameName("Torre Eiffel", "Jardín de la Torre Eiffel")).toBe(false)
    expect(sameName("Musée du Louvre", "Musee du Louvre")).toBe(true)
  })
})
