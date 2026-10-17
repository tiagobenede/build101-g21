import { describe, expect, it } from "vitest"

import { decodePolyline } from "./polyline"

describe("decodePolyline", () => {
  it("decodifica el ejemplo de la documentación de Google", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ])
  })

  it("devuelve vacío para una polyline vacía", () => {
    expect(decodePolyline("")).toEqual([])
  })
})
