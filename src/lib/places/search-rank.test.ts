import { describe, expect, it } from "vitest"

import { pickSearchResults, type SearchCandidate } from "./search-rank"

const c = (id: string, walkMinutes: number, rating: number | null, ratingCount: number | null, extra: Partial<SearchCandidate> = {}): SearchCandidate => ({
  id,
  name: id,
  walkMinutes,
  rating,
  ratingCount,
  status: "OPERATIONAL",
  ...extra,
})

const ids = (list: SearchCandidate[]) => list.map((p) => p.id)

describe("pickSearchResults", () => {
  it("saca los cerrados definitivamente o por un tiempo", () => {
    const found = [c("a", 3, 4.5, 100, { status: "CLOSED_PERMANENTLY" }), c("b", 4, 4.5, 100, { status: "CLOSED_TEMPORARILY" }), c("c", 5, 4.5, 100)]
    expect(ids(pickSearchResults(found, { byName: false, max: 5 }))).toEqual(["c"])
  })

  it("deja una sola sucursal por nombre: la más cerca", () => {
    const found = [
      c("lejos", 12, 3.1, 72, { name: "Farmacia San Roque" }),
      c("cerca", 4, 4.1, 28, { name: "Farmacia San Roque" }),
      c("otra", 6, 4.2, 17, { name: "Farmacia Andromeda" }),
    ]
    const picked = pickSearchResults(found, { byName: false, max: 5 })
    expect(ids(picked).sort()).toEqual(["cerca", "otra"])
  })

  it("compara nombres sin mayúsculas, tildes ni signos", () => {
    const found = [c("a", 2, 4.5, 50, { name: "Café Suárez" }), c("b", 5, 4.5, 50, { name: "cafe suarez!" })]
    expect(ids(pickSearchResults(found, { byName: false, max: 5 }))).toEqual(["a"])
  })

  it("por tipo: lo cercano y bien puntuado primero, no el orden de Google", () => {
    const found = [c("lejos-regular", 14, 3.8, 50), c("cerca-bueno", 1, 4.2, 17), c("medio-muy-bueno", 6, 4.8, 900)]
    expect(ids(pickSearchResults(found, { byName: false, max: 3 }))[0]).not.toBe("lejos-regular")
    expect(ids(pickSearchResults(found, { byName: false, max: 3 })).at(-1)).toBe("lejos-regular")
  })

  it("por tipo: los mal puntuados quedan afuera si hay suficientes buenos", () => {
    const found = [c("malo", 1, 1.5, 23), c("b1", 3, 4.2, 100), c("b2", 4, 4.0, 80), c("b3", 5, 4.4, 60)]
    expect(ids(pickSearchResults(found, { byName: false, max: 3 }))).not.toContain("malo")
  })

  it("por tipo: si no hay otra cosa, mejor un mal puntuado que nada", () => {
    expect(ids(pickSearchResults([c("malo", 1, 2.0, 40)], { byName: false, max: 3 }))).toEqual(["malo"])
  })

  it("por tipo: uno sin reseñas no le gana a uno conocido a la misma distancia", () => {
    const found = [c("nuevo", 3, null, null), c("conocido", 3, 4.4, 500)]
    expect(ids(pickSearchResults(found, { byName: false, max: 2 }))).toEqual(["conocido", "nuevo"])
  })

  it("por nombre: respeta el orden de Google (el primero es el que pidió)", () => {
    const found = [c("louvre", 20, 4.7, 300_000), c("cafe-louvre", 1, 4.9, 2000)]
    expect(ids(pickSearchResults(found, { byName: true, max: 3 }))).toEqual(["louvre", "cafe-louvre"])
  })

  it("corta en el máximo", () => {
    const found = Array.from({ length: 10 }, (_, i) => c(`p${i}`, i + 1, 4.5, 100))
    expect(pickSearchResults(found, { byName: false, max: 4 })).toHaveLength(4)
  })
})
