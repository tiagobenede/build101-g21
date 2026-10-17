import { describe, expect, it } from "vitest"

import { buildGenUiUserMessage, namedPlaceIds, screenPlaces } from "./context"
import type { GenUiPlace } from "./types"

const place = (id: string, walk: number): GenUiPlace => ({
  id,
  name: `Lugar ${id}`,
  category: "Museo",
  tags: ["arte"],
  description: null,
  rating: 4.5,
  walkMinutes: walk,
  visitMinutes: 30,
  lat: 48.86,
  lng: 2.35,
})

describe("screenPlaces", () => {
  const all = [place("a", 1), place("b", 3), place("c", 5), place("d", 7)]

  it("devuelve exactamente los pedidos, en el orden del agente", () => {
    expect(screenPlaces(all, ["c", "a"], 5).map((p) => p.id)).toEqual(["c", "a"])
  })

  it("nunca completa con otros lugares cercanos", () => {
    expect(screenPlaces(all, ["b"], 5).map((p) => p.id)).toEqual(["b"])
    expect(screenPlaces(all, [], 5)).toEqual([])
  })

  it("ignora ids desconocidos, no repite y respeta el máximo", () => {
    expect(screenPlaces(all, ["x", "a", "a", "b", "c"], 2).map((p) => p.id)).toEqual(["a", "b"])
  })
})

describe("buildGenUiUserMessage", () => {
  it("incluye pedido, lugares con id, itinerario y clima", () => {
    const msg = buildGenUiUserMessage({
      request: "ruta al museo",
      places: [place("a", 4)],
      itinerary: [{ time: "18:00", title: "Clase de cocina", locked: true }],
      weather: "18°, nublado.",
      localTime: "16:02",
    })
    expect(msg).toContain("ruta al museo")
    expect(msg).toContain('"id":"a"')
    expect(msg).toContain("Clase de cocina")
    expect(msg).toContain("18°, nublado.")
    expect(msg).toContain("16:02")
  })
})

describe("namedPlaceIds", () => {
  const places = [
    { id: "p", name: "Museo Picasso de París" },
    { id: "v", name: "Place des Vosges" },
    { id: "c", name: "Café Charlot" },
  ]

  it("encuentra lugares nombrados por una palabra distintiva", () => {
    expect(namedPlaceIds("Llevame al Picasso", places)).toEqual(["p"])
    expect(namedPlaceIds("¿cómo llego a los vosges?", places)).toEqual(["v"])
  })

  it("ignora palabras genéricas como museo, plaza o café", () => {
    expect(namedPlaceIds("quiero un café y un museo", places)).toEqual([])
  })
})

