import { describe, expect, it } from "vitest"

import { closingInfo } from "./opening"

describe("closingInfo", () => {
  it("cuánto falta para que cierre", () => {
    expect(closingInfo("10:00–18:00", "17:20")).toEqual({ closesAt: "18:00", closesInMinutes: 40 })
  })

  it("elige el tramo de ahora cuando hay dos", () => {
    expect(closingInfo("12:00–14:30, 19:00–23:00", "20:00")).toEqual({ closesAt: "23:00", closesInMinutes: 180 })
    expect(closingInfo("12:00–14:30, 19:00–23:00", "16:00")).toBeNull()
  })

  it("horario que pasa la medianoche", () => {
    expect(closingInfo("18:00–2:00", "23:30")).toEqual({ closesAt: "2:00", closesInMinutes: 150 })
    expect(closingInfo("18:00–2:00", "1:00")).toEqual({ closesAt: "2:00", closesInMinutes: 60 })
  })

  it("sin horario o con texto ('Abierto 24 horas', 'Cerrado')", () => {
    expect(closingInfo(null, "12:00")).toBeNull()
    expect(closingInfo("Abierto 24 horas", "12:00")).toBeNull()
    expect(closingInfo("Cerrado", "12:00")).toBeNull()
  })
})
