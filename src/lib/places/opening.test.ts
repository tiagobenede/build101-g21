import { describe, expect, it } from "vitest"

import { closingInfo, openLongEnough } from "./opening"

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

describe("openLongEnough", () => {
  it("sin datos de horario queda elegible", () => {
    expect(openLongEnough(null, "22:48", 5, 45)).toBe(true)
    expect(openLongEnough({ openNow: null, hoursToday: null }, "22:48", 5, 45)).toBe(true)
  })

  it("cerrado ahora no se recomienda", () => {
    expect(openLongEnough({ openNow: false, hoursToday: "8:00–22:00" }, "22:48", 3, 15)).toBe(false)
  })

  it("cierra antes de que termine la visita (Eataly a las 22:48, cierra 23:00)", () => {
    expect(openLongEnough({ openNow: true, hoursToday: "9:00–23:00" }, "22:48", 5, 45)).toBe(false)
  })

  it("llega y termina justo antes del cierre", () => {
    expect(openLongEnough({ openNow: true, hoursToday: "9:00–23:00" }, "22:00", 10, 50)).toBe(true)
    expect(openLongEnough({ openNow: true, hoursToday: "9:00–23:00" }, "22:00", 10, 51)).toBe(false)
  })

  it("horario que pasa la medianoche", () => {
    expect(openLongEnough({ openNow: true, hoursToday: "18:00–2:00" }, "23:30", 10, 60)).toBe(true)
  })

  it("abierto sin cierre legible ('Abierto 24 horas') queda elegible", () => {
    expect(openLongEnough({ openNow: true, hoursToday: "Abierto 24 horas" }, "3:00", 10, 60)).toBe(true)
  })
})
