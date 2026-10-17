import { describe, expect, it } from "vitest"

import { matchInterests, normalizeInterest, type MatchablePlace } from "./interests"

const mcdonalds: MatchablePlace = {
  name: "McDonald’s",
  category: "Restaurante",
  tags: ["comida"],
  googleTypes: ["fast_food_restaurant", "hamburger_restaurant", "restaurant"],
}
const hospital: MatchablePlace = { name: "Hôpital Saint-Louis", category: "Salud", tags: [], googleTypes: ["hospital", "health"] }
const museum: MatchablePlace = { name: "Musée des Arts et Métiers", category: "Museo", tags: ["arte", "ciencia"] }

describe("normalizeInterest", () => {
  it("guarda en minúsculas con espacios simples", () => {
    expect(normalizeInterest("  McDonald’s ")).toBe("mcdonald's")
    expect(normalizeInterest("Autos   clásicos")).toBe("autos clásicos")
  })

  it("descarta lo vacío o demasiado largo", () => {
    expect(normalizeInterest(" a ")).toBeNull()
    expect(normalizeInterest("x".repeat(41))).toBeNull()
  })
})

describe("matchInterests", () => {
  it("un tag de la lista coincide con los tags del lugar", () => {
    expect(matchInterests(museum, ["autos", "arte"])).toEqual(["arte"])
  })

  it("un gusto propio coincide con el nombre, sin importar apóstrofes ni mayúsculas", () => {
    expect(matchInterests(mcdonalds, ["mcdonald's"])).toEqual(["mcdonald's"])
    expect(matchInterests(mcdonalds, ["McDonalds"])).toEqual(["McDonalds"])
  })

  it("un gusto en plural coincide con el tipo de Google en singular", () => {
    expect(matchInterests(hospital, ["hospitales"])).toEqual(["hospitales"])
    expect(matchInterests(mcdonalds, ["hamburguesas", "hamburger"])).toEqual(["hamburger"])
  })

  it("ignora artículos y pide todas las palabras", () => {
    expect(matchInterests(hospital, ["los hospitales"])).toEqual(["los hospitales"])
    expect(matchInterests(hospital, ["hospitales de niños"])).toEqual([])
  })

  it("respeta el orden del viajero y no inventa coincidencias", () => {
    expect(matchInterests(mcdonalds, ["autos", "comida", "mcdonald's"])).toEqual(["comida", "mcdonald's"])
    expect(matchInterests(museum, ["mcdonald's", "hospitales"])).toEqual([])
  })
})
