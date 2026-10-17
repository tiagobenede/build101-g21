import { describe, expect, it } from "vitest"

import type { PlaceCard } from "@/hooks/voice-session-types"

import { findNewPlaces, placeToFeature } from "./match-places"

const card = (id: string, name: string): PlaceCard => ({
  id,
  name,
  category: "Museo",
  description: null,
  walkMinutes: 5,
  stayMinutes: 20,
})

const places = [card("arts", "Musée des Arts et Métiers"), card("pompidou", "Centre Pompidou"), card("louvre", "Museo del Louvre")]

describe("findNewPlaces", () => {
  it("encuentra lugares nombrados, sin importar tildes ni mayúsculas", () => {
    const found = findNewPlaces("Andá al musee des arts et metiers, está cerca", places, new Set())
    expect(found.map((p) => p.id)).toEqual(["arts"])
  })

  it("devuelve en orden de aparición", () => {
    const found = findNewPlaces("Primero el Centre Pompidou y después el Musée des Arts et Métiers", places, new Set())
    expect(found.map((p) => p.id)).toEqual(["pompidou", "arts"])
  })

  it("ignora los ya mostrados", () => {
    const found = findNewPlaces("Centre Pompidou", places, new Set(["pompidou"]))
    expect(found).toEqual([])
  })

  it("no encuentra nombres incompletos (texto todavía en streaming)", () => {
    expect(findNewPlaces("Te recomiendo el Centre Pomp", places, new Set())).toEqual([])
  })
})

describe("placeToFeature", () => {
  const sushi = [card("hoki", "Hoki Sushi"), card("cote", "Côté Sushi Rambuteau"), card("petit", "Le Petit Japonais")]
  const ids = sushi.map((p) => p.id)

  it("la voz recomienda otro que el destacado: ese pasa adelante", () => {
    expect(placeToFeature("Probá Côté Sushi Rambuteau, está a 3 minutos", ids, sushi)).toBe("cote")
  })

  it("alcanza con las dos primeras palabras de un nombre largo", () => {
    expect(placeToFeature("Andá a Côté Sushi, a 3 minutos", ids, sushi)).toBe("cote")
  })

  it("si nombra primero el destacado, no cambia nada aunque después nombre otros", () => {
    expect(placeToFeature("Hoki Sushi está a 9 minutos; también está Le Petit Japonais", ids, sushi)).toBeNull()
  })

  it("si no nombra ninguno, no cambia nada", () => {
    expect(placeToFeature("Dejame buscar algo de sushi", ids, sushi)).toBeNull()
  })
})
