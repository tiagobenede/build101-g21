import { describe, expect, it } from "vitest"

import { parseGoogleReverse, parseTextSearchResults, streetLine } from "./geocode"

describe("parseTextSearchResults", () => {
  it("convierte Places Text Search en resultados con nombre y detalle", () => {
    const results = parseTextSearchResults({
      places: [
        {
          displayName: { text: "Avenida Ramón Anador & Avenida Luis Alberto de Herrera" },
          formattedAddress: "Av. Ramón Anador & Av. Luis Alberto de Herrera, 11600 Montevideo, Departamento de Montevideo, Uruguay",
          location: { latitude: -34.8955684, longitude: -56.1432655 },
        },
      ],
    })
    expect(results).toEqual([
      {
        name: "Avenida Ramón Anador & Avenida Luis Alberto de Herrera",
        detail: "Av. Ramón Anador & Av. Luis Alberto de Herrera, 11600 Montevideo, Departamento de Montevideo, Uruguay",
        lat: -34.8955684,
        lng: -56.1432655,
      },
    ])
  })

  it("no repite el nombre en el detalle", () => {
    const [r] = parseTextSearchResults({
      places: [{ displayName: { text: "Shibuya" }, formattedAddress: "Shibuya, Tokio, Japón", location: { latitude: 1, longitude: 2 } }],
    })
    expect(r.detail).toBe("Tokio, Japón")
  })

  it("descarta entradas inválidas y respuestas vacías", () => {
    expect(parseTextSearchResults({})).toEqual([])
    expect(parseTextSearchResults({ error: "x" })).toEqual([])
    expect(parseTextSearchResults({ places: [{ displayName: { text: "X" } }, null] })).toEqual([])
  })
})

const montevideo = {
  status: "OK",
  results: [
    {
      address_components: [
        { long_name: "1701", types: ["street_number"] },
        { long_name: "Avenida Luis Alberto de Herrera", types: ["route"] },
        { long_name: "La Blanqueada", types: ["neighborhood", "political"] },
        { long_name: "Montevideo", types: ["locality", "political"] },
        { long_name: "Departamento de Montevideo", types: ["administrative_area_level_1", "political"] },
        { long_name: "Uruguay", types: ["country", "political"] },
      ],
    },
  ],
}

describe("parseGoogleReverse", () => {
  it("toma calle, barrio, ciudad y país", () => {
    expect(parseGoogleReverse(montevideo)).toEqual({
      street: "Avenida Luis Alberto de Herrera",
      barrio: "La Blanqueada",
      city: "Montevideo",
      country: "Uruguay",
    })
  })

  it("usa la provincia si no hay ciudad, y busca en todos los resultados", () => {
    const raw = {
      status: "OK",
      results: [
        { address_components: [{ long_name: "Ruta 10", types: ["route"] }] },
        {
          address_components: [
            { long_name: "Maldonado", types: ["administrative_area_level_1"] },
            { long_name: "Uruguay", types: ["country"] },
          ],
        },
      ],
    }
    expect(parseGoogleReverse(raw)).toEqual({ street: "Ruta 10", barrio: null, city: "Maldonado", country: "Uruguay" })
  })

  it("devuelve null sin resultados o con error", () => {
    expect(parseGoogleReverse({ status: "ZERO_RESULTS", results: [] })).toBeNull()
    expect(parseGoogleReverse({ status: "REQUEST_DENIED", error_message: "x" })).toBeNull()
    expect(parseGoogleReverse(null)).toBeNull()
  })
})

describe("streetLine", () => {
  it("arma calle, barrio y ciudad sin repetir", () => {
    expect(streetLine({ street: "Place des Vosges", barrio: null, city: "Paris", country: "Francia" })).toBe("Place des Vosges, Paris")
    expect(streetLine({ street: "A", barrio: "Paris", city: "Paris", country: null })).toBe("A, Paris")
  })

  it("devuelve null sin calle ni barrio", () => {
    expect(streetLine({ street: null, barrio: null, city: "Paris", country: "Francia" })).toBeNull()
    expect(streetLine(null)).toBeNull()
  })
})
