import { describe, expect, it } from "vitest"

import { isSimulated, parseClockOffset, shiftedNow } from "./clock"

describe("parseClockOffset", () => {
  it("lee la diferencia en ms; sin cookie o con basura, hora real", () => {
    expect(parseClockOffset("5400000")).toBe(5_400_000)
    expect(parseClockOffset("-3600000")).toBe(-3_600_000)
    expect(parseClockOffset(undefined)).toBe(0)
    expect(parseClockOffset("")).toBe(0)
    expect(parseClockOffset("mañana")).toBe(0)
  })

  it("más de una semana es un error: hora real", () => {
    expect(parseClockOffset(String(8 * 24 * 60 * 60_000))).toBe(0)
  })
})

describe("isSimulated", () => {
  it("la hora real (o casi) no es simulada; una hora corrida, sí", () => {
    expect(isSimulated(new Date())).toBe(false)
    expect(isSimulated(shiftedNow(30_000))).toBe(false)
    expect(isSimulated(shiftedNow(90 * 60_000))).toBe(true)
  })
})
