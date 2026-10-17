import { describe, expect, it } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

import { buildJevOptions, MAX_CANDIDATES, NONE_KEY, pickCandidates, readJevChoice } from "./choose"

const place = (i: number, distanceMeters: number, description: string | null = null): NearbyPlace => ({
  id: `g:${i}`,
  name: `Lugar ${i}`,
  category: "Plaza",
  tags: [],
  description,
  lat: 48.85,
  lng: 2.36,
  rating: null,
  typical_visit_minutes: 20,
  distanceMeters,
  walkMinutes: 1,
})

describe("pickCandidates", () => {
  it("se queda con los cercanos, como mucho MAX_CANDIDATES", () => {
    const nearby = [...Array.from({ length: 10 }, (_, i) => place(i, i * 20)), place(99, 400)]
    const picked = pickCandidates(nearby)
    expect(picked).toHaveLength(MAX_CANDIDATES)
    expect(picked.every((p) => p.distanceMeters <= 250)).toBe(true)
  })
})

describe("buildJevOptions", () => {
  it("usa claves cortas, describe cada lugar y agrega 'ninguno'", () => {
    const { criteria, places } = buildJevOptions([place(1, 10, "La plaza más antigua de París."), place(2, 50)])
    expect(criteria).toEqual({
      p1: "Lugar 1 (Plaza): La plaza más antigua de París.",
      p2: "Lugar 2 (Plaza)",
      [NONE_KEY]: expect.stringContaining("Ninguno"),
    })
    expect(places.get("p2")?.id).toBe("g:2")
  })
})

describe("readJevChoice", () => {
  const { places } = buildJevOptions([place(1, 10)])

  it("devuelve el lugar elegido con confianza", () => {
    expect(readJevChoice({ choice: "p1", confidence: 0.9 }, places)).toEqual({ place: places.get("p1"), confidence: 0.9 })
  })

  it("devuelve null con 'ninguno', poca confianza o una clave desconocida", () => {
    expect(readJevChoice({ choice: NONE_KEY, confidence: 0.99 }, places)).toBeNull()
    expect(readJevChoice({ choice: "p1", confidence: 0.3 }, places)).toBeNull()
    expect(readJevChoice({ choice: "p7", confidence: 0.9 }, places)).toBeNull()
  })
})
