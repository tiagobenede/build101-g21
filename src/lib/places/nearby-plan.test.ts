import { describe, expect, it } from "vitest"

import { SHOP_TYPES } from "./google-types"
import { areaCell, blockCell, nearbyQueries } from "./nearby-plan"

const corner = { lat: -34.8955684, lng: -56.1432655 }

describe("nearbyQueries", () => {
  it("pide lo popular de la zona por rubro y lo más cercano de la cuadra", () => {
    const queries = nearbyQueries(corner)
    expect(queries.filter((q) => q.rankPreference === "POPULARITY")).toHaveLength(3)
    expect(queries.filter((q) => q.rankPreference === "DISTANCE")).toHaveLength(2)
    expect(queries.some((q) => q.rankPreference === "POPULARITY" && q.includedTypes === SHOP_TYPES)).toBe(true)
  })

  it("lo cercano busca en un radio chico y lo popular en uno grande", () => {
    const queries = nearbyQueries(corner)
    const near = queries.filter((q) => q.rankPreference === "DISTANCE").map((q) => q.radius)
    const popular = queries.filter((q) => q.rankPreference === "POPULARITY").map((q) => q.radius)
    expect(Math.max(...near)).toBeLessThan(Math.min(...popular))
  })

  it("Google acepta como mucho 50 tipos por búsqueda", () => {
    for (const q of nearbyQueries(corner)) expect(q.includedTypes.length).toBeLessThanOrEqual(50)
  })
})

describe("celdas", () => {
  it("caminar unos metros no cambia de cuadra; cruzar el barrio sí", () => {
    expect(blockCell({ lat: corner.lat + 0.0005, lng: corner.lng })).toBe(blockCell(corner))
    expect(blockCell({ lat: corner.lat + 0.01, lng: corner.lng })).not.toBe(blockCell(corner))
  })

  it("la zona es más grande que la cuadra", () => {
    expect(areaCell({ lat: corner.lat - 0.003, lng: corner.lng })).toBe(areaCell(corner))
    expect(areaCell(corner)).not.toBe(blockCell(corner))
  })
})
