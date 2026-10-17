import { describe, expect, it } from "vitest"

import { addMinutesIso, zonedDateKey, zonedTimeToIso, zonedTimeValue } from "./zoned"

const TZ = "Europe/Paris"

describe("zonedTimeToIso", () => {
  it("convierte una hora de París en verano (UTC+2) a ISO", () => {
    expect(zonedTimeToIso("2026-07-10", "13:00", TZ)).toBe("2026-07-10T11:00:00.000Z")
  })

  it("convierte una hora de París en invierno (UTC+1) a ISO", () => {
    expect(zonedTimeToIso("2026-12-10", "13:00", TZ)).toBe("2026-12-10T12:00:00.000Z")
  })

  it("rechaza horas inválidas", () => {
    expect(() => zonedTimeToIso("2026-07-10", "25:00", TZ)).toThrow()
  })
})

describe("zonedTimeValue / zonedDateKey", () => {
  it("devuelve HH:MM y la fecha en la zona del viaje", () => {
    const iso = "2026-07-10T22:30:00.000Z" // 00:30 del 11 en París
    expect(zonedTimeValue(iso, TZ)).toBe("00:30")
    expect(zonedDateKey(new Date(iso), TZ)).toBe("2026-07-11")
  })
})

describe("addMinutesIso", () => {
  it("suma minutos", () => {
    expect(addMinutesIso("2026-07-10T11:00:00.000Z", 45)).toBe("2026-07-10T11:45:00.000Z")
  })
})
