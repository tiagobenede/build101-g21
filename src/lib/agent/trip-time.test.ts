import { describe, expect, it } from "vitest"

import { tripTimeToIso } from "./trip-time"

const now = new Date("2026-10-17T10:00:00Z")

describe("tripTimeToIso", () => {
  it("convierte la hora de París de hoy (UTC+2 en octubre)", () => {
    expect(tripTimeToIso("16:00", null, now, "Europe/Paris")).toBe("2026-10-17T14:00:00.000Z")
  })

  it("respeta la fecha y el cambio de horario (UTC+1 desde el 25 de octubre)", () => {
    expect(tripTimeToIso("9:30", "2026-10-26", now, "Europe/Paris")).toBe("2026-10-26T08:30:00.000Z")
  })

  it("usa la fecha del viaje aunque en UTC ya sea otro día", () => {
    expect(tripTimeToIso("01:00", null, new Date("2026-10-17T23:30:00Z"), "Europe/Paris")).toBe("2026-10-17T23:00:00.000Z")
  })

  it("rechaza formatos inválidos", () => {
    expect(tripTimeToIso("25:00", null, now, "Europe/Paris")).toBeNull()
    expect(tripTimeToIso("16:00", "mañana", now, "Europe/Paris")).toBeNull()
  })
})
