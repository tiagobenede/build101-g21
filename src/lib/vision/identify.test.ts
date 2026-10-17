import { describe, expect, it, vi } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

vi.mock("server-only", () => ({}))

const { combineVision, sameThing } = await import("./identify")

const louvre: NearbyPlace = {
  id: "g:louvre",
  name: "Museo del Louvre",
  category: "Museo",
  tags: [],
  description: "Museo de arte en el antiguo palacio real.",
  lat: 48.8606,
  lng: 2.3376,
  rating: 4.7,
  typical_visit_minutes: 180,
  distanceMeters: 40,
  walkMinutes: 1,
}

describe("combineVision", () => {
  it("una obra adentro de un museo: gana la obra y el museo queda como dónde", () => {
    const r = combineVision(
      { place: louvre, confidence: 0.9 },
      { name: "La Gioconda", mapName: null, kind: "obra", where: null, about: "Retrato de Leonardo da Vinci, c. 1503." }
    )
    expect(r).toMatchObject({ via: "llm", name: "La Gioconda", kind: "obra", where: "Museo del Louvre", place: null })
  })

  it("un lugar que Jev encontró cerca: queda el de Jev, con su tarjeta", () => {
    const r = combineVision({ place: louvre, confidence: 0.8 }, { name: "Museo del Louvre", mapName: "Musée du Louvre", kind: "lugar", where: null, about: null })
    expect(r).toMatchObject({ via: "jev", name: "Museo del Louvre", kind: "lugar", place: { id: "g:louvre" } })
  })

  it("un monumento que no está entre los cercanos (la Torre Eiffel vista de lejos): lo dice el LLM", () => {
    const r = combineVision(null, { name: "Torre Eiffel", mapName: "Tour Eiffel", kind: "lugar", where: null, about: "Torre de hierro de Gustave Eiffel, 1889." })
    expect(r).toMatchObject({ via: "llm", name: "Torre Eiffel", kind: "lugar", description: "Torre de hierro de Gustave Eiffel, 1889.", place: null })
  })

  it("Jev eligió el parque pero la foto es la Torre Eiffel (fuera de los cercanos): gana el LLM", () => {
    const park = { ...louvre, id: "g:champ", name: "Campo de Marte", category: "Parque", description: null }
    const r = combineVision({ place: park, confidence: 0.75 }, { name: "Torre Eiffel", mapName: "Tour Eiffel", kind: "lugar", where: null, about: null }, [park])
    expect(r).toMatchObject({ via: "llm", name: "Torre Eiffel", place: null })
  })

  it("el lugar que nombró el LLM está entre los cercanos aunque Jev no lo eligió: se usa ese", () => {
    const r = combineVision(null, { name: "Museo del Louvre", mapName: "Musée du Louvre", kind: "lugar", where: null, about: null }, [louvre])
    expect(r).toMatchObject({ via: "llm", name: "Museo del Louvre", place: { id: "g:louvre" } })
  })

  it("si el LLM falla, sigue sirviendo lo de Jev", () => {
    expect(combineVision({ place: louvre, confidence: 0.8 }, null)).toMatchObject({ via: "jev", name: "Museo del Louvre" })
  })

  it("nada reconocible: sin nombre", () => {
    expect(combineVision(null, null)).toMatchObject({ name: null, kind: null })
  })
})

describe("sameThing", () => {
  it("compara por las palabras propias, sin acentos ni palabras genéricas", () => {
    expect(sameThing({ name: "Museo del Louvre", mapName: null }, "Musée du Louvre")).toBe(true)
    expect(sameThing({ name: "Plaza de los Vosgos", mapName: "Place des Vosges" }, "Place des Vosges")).toBe(true)
    expect(sameThing({ name: "Torre Eiffel", mapName: "Tour Eiffel" }, "Campo de Marte")).toBe(false)
    expect(sameThing({ name: "Torre Eiffel", mapName: null }, "Torre Montparnasse")).toBe(false)
  })
})
