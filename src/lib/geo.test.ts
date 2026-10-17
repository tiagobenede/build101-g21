import { describe, expect, it } from "vitest"

import { nearestPlaceLabel } from "./geo"

const VOSGES = { name: "Place des Vosges", lat: 48.8556, lng: 2.3655 }
const PICASSO = { name: "Musée Picasso", lat: 48.8598, lng: 2.3624 }

describe("nearestPlaceLabel", () => {
  it("devuelve el lugar más cercano", () => {
    expect(nearestPlaceLabel({ lat: 48.8557, lng: 2.3656 }, [PICASSO, VOSGES], "París")).toBe("Place des Vosges")
  })

  it("usa el respaldo si no hay ningún lugar a menos de 300 m", () => {
    // ~500 m al sur de Place des Vosges
    expect(nearestPlaceLabel({ lat: 48.8511, lng: 2.3655 }, [VOSGES], "París")).toBe("París")
  })

  it("usa el respaldo sin lugares", () => {
    expect(nearestPlaceLabel({ lat: 48.8556, lng: 2.3655 }, [], "París")).toBe("París")
  })
})
