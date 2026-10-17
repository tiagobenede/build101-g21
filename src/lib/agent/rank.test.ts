import { describe, expect, it } from "vitest"

import { rankPlaces, resolveAvailableMinutes, type RankablePlace } from "./rank"

const place = (id: string, tags: string[], walkMinutes: number, visit = 30, rating = 4.5): RankablePlace => ({
  id,
  name: id,
  category: "Lugar",
  tags,
  description: null,
  lat: 0,
  lng: 0,
  rating,
  typical_visit_minutes: visit,
  walkMinutes,
})

const base = { interests: ["comida", "mercados", "parques"], requestedTag: null, availableMinutes: 60, alreadyRecommended: [] }

describe("resolveAvailableMinutes", () => {
  const now = new Date("2026-10-17T10:00:00Z")

  it("usa lo que dijo el viajero", () => {
    expect(resolveAvailableMinutes(45, new Date("2026-10-17T10:30:00Z"), now)).toBe(45)
  })

  it("sin dato, llega al próximo compromiso con margen", () => {
    expect(resolveAvailableMinutes(null, new Date("2026-10-17T11:00:00Z"), now)).toBe(45)
  })

  it("sin dato ni compromiso, una hora", () => {
    expect(resolveAvailableMinutes(null, null, now)).toBe(60)
  })
})

describe("rankPlaces", () => {
  it("prioriza el primer gusto", () => {
    const ranked = rankPlaces({ ...base, places: [place("parque", ["parques"], 5), place("mercado", ["comida"], 5)] })
    expect(ranked.map((r) => r.place.id)).toEqual(["mercado", "parque"])
  })

  it("descarta lo que no entra en el tiempo libre", () => {
    const ranked = rankPlaces({ ...base, availableMinutes: 30, places: [place("lejos", ["comida"], 25), place("cerca", ["comida"], 5)] })
    expect(ranked.map((r) => r.place.id)).toEqual(["cerca"])
    expect(ranked[0].stayMinutes).toBe(25)
  })

  it("descarta lo que no coincide con ningún gusto", () => {
    expect(rankPlaces({ ...base, places: [place("autos", ["autos"], 2)] })).toEqual([])
  })

  it("si pide algo puntual, solo devuelve eso aunque no esté en sus gustos", () => {
    const ranked = rankPlaces({ ...base, requestedTag: "autos", places: [place("autos", ["autos"], 2), place("mercado", ["comida"], 2)] })
    expect(ranked.map((r) => r.place.id)).toEqual(["autos"])
  })

  it("baja lo que ya recomendó y devuelve como máximo 3", () => {
    const places = ["a", "b", "c", "d"].map((id) => place(id, ["comida"], 5))
    const ranked = rankPlaces({ ...base, places, alreadyRecommended: ["a"] })
    expect(ranked).toHaveLength(3)
    expect(ranked.map((r) => r.place.id)).not.toContain("a")
  })

  it("con dieta vegetariana descarta parrillas y sube los vegetarianos", () => {
    const parrilla = { ...place("parrilla", ["comida"], 2, 30, 4.9), googleTypes: ["steak_house", "restaurant"] }
    const veggie = { ...place("veggie", ["comida"], 9, 30, 4.0), googleTypes: ["vegetarian_restaurant", "restaurant"] }
    const comun = { ...place("comun", ["comida"], 2, 30, 4.5), googleTypes: ["restaurant"] }
    const ranked = rankPlaces({ ...base, dietary: ["vegetariano"], places: [parrilla, veggie, comun] })
    expect(ranked.map((r) => r.place.id)).toEqual(["veggie", "comun"])
  })
})
