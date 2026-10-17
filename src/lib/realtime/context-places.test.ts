import { describe, expect, it } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

import { pickContextPlaces } from "./context-places"

const place = (name: string, category: string, distanceMeters: number, ratingCount: number | null = null): NearbyPlace => ({
  id: name,
  name,
  category,
  tags: [],
  description: null,
  lat: 0,
  lng: 0,
  rating: null,
  typical_visit_minutes: 20,
  distanceMeters,
  walkMinutes: Math.round(distanceMeters / 80),
  rating_count: ratingCount,
})

describe("pickContextPlaces", () => {
  it("no deja que un rubro tape a los demás", () => {
    const nearby = [
      ...Array.from({ length: 10 }, (_, i) => place(`Resto ${i}`, "Restaurante", 50 + i * 10)),
      place("Montevideo Shopping", "Pasaje", 1_100),
      place("Parque Batlle", "Parque", 1_500),
    ]
    const picked = pickContextPlaces(nearby, 5).map((p) => p.name)
    expect(picked).toContain("Montevideo Shopping")
    expect(picked).toContain("Parque Batlle")
    expect(picked).toHaveLength(5)
  })

  it("dentro de cada rubro van primero los más cercanos y el resultado sale ordenado por distancia", () => {
    const nearby = [place("Café lejos", "Café", 900), place("Café cerca", "Café", 100), place("Museo", "Museo", 500)]
    const picked = pickContextPlaces(nearby, 2).map((p) => p.name)
    expect(picked).toEqual(["Café cerca", "Museo"])
  })

  it("en cada rubro entra el más conocido aunque haya tiendas más cerca", () => {
    const nearby = [
      ...Array.from({ length: 10 }, (_, i) => place(`Tienda ${i}`, "Pasaje", 50 + i * 10, 20)),
      place("Montevideo Shopping", "Pasaje", 1_100, 60_000),
      ...Array.from({ length: 10 }, (_, i) => place(`Resto ${i}`, "Restaurante", 40 + i * 10, 100)),
    ]
    const picked = pickContextPlaces(nearby, 4).map((p) => p.name)
    expect(picked).toContain("Montevideo Shopping")
    expect(picked).toContain("Tienda 0")
  })

  it("si hay menos lugares que el tope, devuelve todos", () => {
    expect(pickContextPlaces([place("A", "Café", 10)], 20)).toHaveLength(1)
  })
})
