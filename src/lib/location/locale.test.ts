import { describe, expect, it } from "vitest"

import { parseReverseGeocode, timeZoneAt } from "./locale"

describe("timeZoneAt", () => {
  it.each([
    [{ lat: -34.9058, lng: -56.1913 }, "America/Montevideo"],
    [{ lat: 48.8606, lng: 2.3522 }, "Europe/Paris"],
    [{ lat: 35.6637, lng: 139.6977 }, "Asia/Tokyo"],
    [{ lat: -34.6037, lng: -58.3816 }, "America/Argentina/Buenos_Aires"],
  ])("%o → %s", (loc, tz) => {
    expect(timeZoneAt(loc)).toBe(tz)
  })

  it("devuelve UTC con coordenadas inválidas", () => {
    expect(timeZoneAt({ lat: 999, lng: 0 })).toBe("UTC")
  })
})

describe("parseReverseGeocode", () => {
  it("toma ciudad y país", () => {
    expect(parseReverseGeocode({ address: { city: "Montevideo", state: "Montevideo", country: "Uruguay" } })).toEqual({
      city: "Montevideo",
      country: "Uruguay",
    })
  })

  it("usa pueblo, municipio o provincia si no hay ciudad", () => {
    expect(parseReverseGeocode({ address: { town: "Punta del Este", country: "Uruguay" } })?.city).toBe("Punta del Este")
    expect(parseReverseGeocode({ address: { state: "Maldonado", country: "Uruguay" } })?.city).toBe("Maldonado")
  })

  it("devuelve null con respuestas sin dirección", () => {
    expect(parseReverseGeocode({ error: "Unable to geocode" })).toBeNull()
    expect(parseReverseGeocode(null)).toBeNull()
  })
})
