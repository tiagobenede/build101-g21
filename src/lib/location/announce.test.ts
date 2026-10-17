import { describe, expect, it } from "vitest"

import { bearingDegrees, cardinalEs, locationUpdateText, shouldAnnounce } from "./announce"
import { stepPosition } from "./simulate"

const POMPIDOU = { lat: 48.8606, lng: 2.3522 }
const walk = (x: number, y: number, seconds: number) => stepPosition(POMPIDOU, { x, y }, seconds, 1)

describe("bearingDegrees", () => {
  it.each([
    [0, 1, 0],
    [1, 0, 90],
    [0, -1, 180],
    [-1, 0, 270],
  ])("vector (%d,%d) → %d°", (x, y, expected) => {
    expect(bearingDegrees(POMPIDOU, walk(x, y, 100))).toBeCloseTo(expected, 0)
  })
})

describe("cardinalEs", () => {
  it.each([
    [0, "norte"],
    [44, "noreste"],
    [90, "este"],
    [135, "sureste"],
    [180, "sur"],
    [225, "suroeste"],
    [270, "oeste"],
    [315, "noroeste"],
    [359, "norte"],
  ])("%d° → %s", (deg, name) => {
    expect(cardinalEs(deg)).toBe(name)
  })
})

describe("shouldAnnounce", () => {
  it("avisa al moverse 150 m o más desde el último aviso", () => {
    expect(shouldAnnounce(POMPIDOU, walk(0, 1, 120))).toBe(true) // ~168 m
    expect(shouldAnnounce(POMPIDOU, walk(0, 1, 80))).toBe(false) // ~112 m
  })
})

describe("locationUpdateText", () => {
  it("dice cuánto y hacia dónde se movió, y que use el tool", () => {
    const text = locationUpdateText(POMPIDOU, walk(1, 0, 214)) // ~300 m al este
    expect(text).toContain("300 m")
    expect(text).toContain("este")
    expect(text).toContain("recommend_nearby")
  })

  it("usa km para distancias largas", () => {
    expect(locationUpdateText(POMPIDOU, { lat: 35.66, lng: 139.7 })).toMatch(/\d+(\.\d)? km/)
  })
})
