import { describe, expect, it } from "vitest"

import { parseGeocodeResults } from "./geocode"

describe("parseGeocodeResults", () => {
  it("convierte la respuesta de Nominatim en resultados con nombre y detalle", () => {
    const results = parseGeocodeResults([
      { lat: "35.6637109", lon: "139.6976941", name: "Shibuya", display_name: "Shibuya, Tokio, Japón" },
    ])
    expect(results).toEqual([{ name: "Shibuya", detail: "Tokio, Japón", lat: 35.6637109, lng: 139.6976941 }])
  })

  it("usa el primer tramo de display_name si no hay name", () => {
    const [r] = parseGeocodeResults([{ lat: "1", lon: "2", name: "", display_name: "Calle 1, Montevideo, Uruguay" }])
    expect(r.name).toBe("Calle 1")
    expect(r.detail).toBe("Montevideo, Uruguay")
  })

  it("descarta entradas inválidas y respuestas que no son lista", () => {
    expect(parseGeocodeResults({ error: "x" })).toEqual([])
    expect(parseGeocodeResults([{ lat: "no", lon: "2", display_name: "X" }, null])).toEqual([])
  })
})
