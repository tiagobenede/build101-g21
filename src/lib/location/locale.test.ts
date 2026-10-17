import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { timeZoneAt } = await import("./locale")

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
