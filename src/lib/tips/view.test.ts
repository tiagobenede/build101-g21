import { describe, expect, it } from "vitest"

import { planSlots, recommendedBy, splitRecommender } from "./view"

describe("planSlots", () => {
  it("redondea a la próxima media hora y suma 1 h y 2 h", () => {
    expect(planSlots(Date.parse("2026-10-17T14:07:00Z"))).toEqual([
      "2026-10-17T14:30:00.000Z",
      "2026-10-17T15:30:00.000Z",
      "2026-10-17T16:30:00.000Z",
    ])
  })

  it("si ya es media hora justa, empieza ahí", () => {
    expect(planSlots(Date.parse("2026-10-17T14:30:00Z"))[0]).toBe("2026-10-17T14:30:00.000Z")
  })
})

describe("recommendedBy", () => {
  it("nombra a quien lo recomendó, si se sabe", () => {
    expect(recommendedBy("Camille")).toBe("Te lo recomendó Camille")
    expect(recommendedBy(null)).toBe("Te lo recomendó alguien del lugar")
    expect(recommendedBy("Camille, trabaja en la panadería. ")).toBe("Te lo recomendó Camille, trabaja en la panadería")
    expect(recommendedBy("  ")).toBe("Te lo recomendó alguien del lugar")
  })
})

describe("splitRecommender", () => {
  it("separa el nombre de quién es", () => {
    expect(splitRecommender("Camille, la de la panadería de al lado.")).toEqual({ name: "Camille", detail: "la de la panadería de al lado" })
    expect(splitRecommender("Camille")).toEqual({ name: "Camille", detail: null })
    expect(splitRecommender(null)).toEqual({ name: null, detail: null })
  })
})
