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

const base = { interests: ["comida", "mercados", "parques"], requestedTag: null, availableMinutes: 60, maxWalkMinutes: 20, alreadyRecommended: [] }

describe("resolveAvailableMinutes", () => {
  const now = new Date("2026-10-17T10:00:00Z")

  it("usa lo que dijo el viajero", () => {
    expect(resolveAvailableMinutes(45, new Date("2026-10-17T12:00:00Z"), now)).toBe(45)
    expect(resolveAvailableMinutes(45, null, now)).toBe(45)
  })

  it("si el compromiso llega antes de lo que dijo, manda el compromiso (con margen)", () => {
    expect(resolveAvailableMinutes(45, new Date("2026-10-17T10:30:00Z"), now)).toBe(15)
  })

  it("sin dato, llega al próximo compromiso con margen", () => {
    expect(resolveAvailableMinutes(null, new Date("2026-10-17T11:00:00Z"), now)).toBe(45)
  })

  it("sin dato ni compromiso, una hora", () => {
    expect(resolveAvailableMinutes(null, null, now)).toBe(60)
  })
})

describe("rankPlaces", () => {
  it("no recomienda nada más lejos que el tope de caminata", () => {
    const ranked = rankPlaces({ ...base, maxWalkMinutes: 10, places: [place("lejos", ["comida"], 20), place("cerca", ["comida"], 8)] })
    expect(ranked.map((r) => r.place.id)).toEqual(["cerca"])
  })

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

  it("entre lugares del mismo gusto, sube el más conocido aunque esté un poco más lejos", () => {
    const tienda = { ...place("tienda", ["compras"], 1, 20, 4.8), rating_count: 20 }
    const shopping = { ...place("shopping", ["compras"], 17, 30, 4.4), rating_count: 53_000 }
    const ranked = rankPlaces({ ...base, places: [tienda, shopping], requestedTag: "compras" })
    expect(ranked[0].place.id).toBe("shopping")
  })

  it("si pide algo puntual, sus gustos no tapan al lugar obvio", () => {
    const tiendaDeDiseno = { ...place("tienda", ["compras", "diseño"], 5, 20, 4.9), rating_count: 214 }
    const shopping = { ...place("shopping", ["compras"], 17, 30, 4.4), rating_count: 53_000 }
    const ranked = rankPlaces({ ...base, interests: ["diseño", "autos", "arquitectura", "café"], places: [tiendaDeDiseno, shopping], requestedTag: "compras" })
    expect(ranked[0].place.id).toBe("shopping")
  })

  it("con dieta vegetariana descarta parrillas y sube los vegetarianos", () => {
    const parrilla = { ...place("parrilla", ["comida"], 2, 30, 4.9), googleTypes: ["steak_house", "restaurant"] }
    const veggie = { ...place("veggie", ["comida"], 9, 30, 4.0), googleTypes: ["vegetarian_restaurant", "restaurant"] }
    const comun = { ...place("comun", ["comida"], 2, 30, 4.5), googleTypes: ["restaurant"] }
    const ranked = rankPlaces({ ...base, dietary: ["vegetariano"], places: [parrilla, veggie, comun] })
    expect(ranked.map((r) => r.place.id)).toEqual(["veggie", "comun"])
  })

  it("un gusto propio que le contó al agente (mcdonald's) cuenta como gusto", () => {
    const mcdonalds = { ...place("mc", [], 3), name: "McDonald's" }
    const ranked = rankPlaces({ ...base, interests: ["mcdonald's"], places: [mcdonalds, place("museo", ["arte"], 2)] })
    expect(ranked.map((r) => [r.place.id, r.matchedTags])).toEqual([["mc", ["mcdonald's"]]])
  })
})

describe("rankPlaces con un compromiso después", () => {
  // Una línea norte-sur: el viajero en 0, el compromiso 2 km al sur (~32 min a pie).
  const south = (meters: number) => -meters / 111_320
  const at = (id: string, tags: string[], lat: number, walkMinutes: number): RankablePlace => ({ ...place(id, tags, walkMinutes, 40), lat })
  const nextStop = { lat: south(2_000), lng: 0, walkMinutes: 32 }

  it("prefiere lo que queda de camino a lo que queda para el otro lado", () => {
    const onTheWay = at("de camino", ["mercados"], south(600), 10)
    const behind = at("para atrás", ["mercados"], -south(600), 10)
    const ranked = rankPlaces({ ...base, availableMinutes: 120, nextStop, places: [behind, onTheWay] })
    expect(ranked.map((r) => r.place.id)).toEqual(["de camino", "para atrás"])
    expect(ranked[0]!.walkToNextMinutes).toBeLessThan(ranked[1]!.walkToNextMinutes!)
  })

  it("el tiempo tiene que alcanzar para ir, quedarse y llegar al compromiso", () => {
    const behind = at("para atrás", ["mercados"], -south(600), 10)
    // 10 de ida + ~42 hasta el compromiso: con 55 min quedan menos de 10 de visita.
    expect(rankPlaces({ ...base, availableMinutes: 55, nextStop, places: [behind] })).toEqual([])
  })

  it("sin compromiso, walkToNextMinutes es null", () => {
    expect(rankPlaces({ ...base, places: [place("x", ["comida"], 5)] })[0]!.walkToNextMinutes).toBeNull()
  })
})
