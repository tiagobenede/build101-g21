import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { nameFilter, namesMatch, sameName } = await import("./lookup")

describe("namesMatch", () => {
  it("tolera palabras de más o de menos y los acentos", () => {
    expect(namesMatch("Marché couvert des Enfants Rouges", "Marche des Enfants Rouges")).toBe(true)
    expect(namesMatch("Museo Carnavalet", "el Carnavalet")).toBe(true)
  })

  it("no confunde lugares distintos", () => {
    expect(namesMatch("Mc Café", "Café Brasilero")).toBe(false)
    expect(namesMatch("Museo", "Museo Picasso")).toBe(false)
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

describe("nameFilter", () => {
  /** Lo que haría `ilike` de Postgres con el patrón (sin distinguir mayúsculas). */
  const ilike = (pattern: string, value: string) =>
    new RegExp(`^${pattern.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(value)
  const matches = (query: string, name: string) => nameFilter(query).some((p) => ilike(p, name))

  it("encuentra el nombre aunque cambien las tildes", () => {
    expect(matches("marche des enfants rouges", "Marché couvert des Enfants Rouges")).toBe(true)
    expect(matches("Olegaria Cafe", "Olegaria Café")).toBe(true)
  })

  it("también por la palabra traducida (centre → centro)", () => {
    expect(matches("Centre Pompidou", "Centro Nacional de Arte y Cultura Georges Pompidou")).toBe(true)
  })

  it("no trae lo que no comparte ninguna palabra", () => {
    expect(matches("Olegaria Café", "Farmacia Andromeda")).toBe(false)
  })

  it("sin palabras que sirvan, no hay filtro", () => {
    expect(nameFilter("el")).toEqual([])
  })
})
