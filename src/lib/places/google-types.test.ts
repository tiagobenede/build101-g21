import { describe, expect, it } from "vitest"

import { toPlaceRow, type GooglePlace } from "./google-types"

const g = (over: Partial<GooglePlace>): GooglePlace => ({
  id: "abc",
  displayName: { text: "Lugar" },
  location: { latitude: 48.86, longitude: 2.35 },
  ...over,
})

describe("toPlaceRow", () => {
  it("usa el tipo principal para la categoría y junta los tags de todos los tipos", () => {
    const row = toPlaceRow(g({ primaryType: "market", types: ["market", "bakery", "point_of_interest"], rating: 4.56 }), "París")
    expect(row).toMatchObject({
      id: "g:abc",
      category: "Mercado",
      tags: ["mercados", "comida", "café"],
      rating: 4.6,
      typical_visit_minutes: 30,
      city: "París",
      data: { google_place_id: "abc" },
    })
  })

  it("los restaurantes por cocina cuentan como restaurante", () => {
    expect(toPlaceRow(g({ primaryType: "french_restaurant" }), "París")?.category).toBe("Restaurante")
  })

  it("descarta tipos que no usamos o lugares sin ubicación", () => {
    expect(toPlaceRow(g({ primaryType: "atm", types: ["atm"] }), "París")).toBeNull()
    expect(toPlaceRow(g({ primaryType: "cafe", location: undefined }), "París")).toBeNull()
  })
})
