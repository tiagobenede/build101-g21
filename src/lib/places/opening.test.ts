import { describe, expect, it } from "vitest"

import { closingInfo, hoursOfDay, mondayIndex, openAt, openLongEnough } from "./opening"

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

describe("openAt (hora simulada)", () => {
  it("abierto dentro de un tramo, cerrado fuera", () => {
    expect(openAt("7:00–14:00", "9:30")).toBe(true)
    expect(openAt("7:00–14:00", "18:00")).toBe(false)
  })

  it("'Cerrado' y 'Abierto las 24 horas'", () => {
    expect(openAt("Cerrado", "12:00")).toBe(false)
    expect(openAt("Abierto las 24 horas", "3:00")).toBe(true)
  })

  it("sin horario no se sabe", () => {
    expect(openAt(null, "12:00")).toBeNull()
  })

  it("toma el día de la semana de la zona (lunes = 0)", () => {
    const week = ["lunes: 9:00–18:00", "martes: Cerrado", "miércoles: 9:00–18:00", "jueves: 9:00–18:00", "viernes: 9:00–18:00", "sábado: 10:00–20:00", "domingo: Cerrado"]
    // Domingo 18/10/2026 a las 13:30 UTC: en París es domingo; en Nueva York también.
    const sunday = new Date("2026-10-18T13:30:00Z")
    expect(mondayIndex(sunday, "Europe/Paris")).toBe(6)
    expect(hoursOfDay(week, mondayIndex(sunday, "Europe/Paris"))).toBe("Cerrado")
    // Lunes 00:30 en París es todavía domingo en Nueva York.
    const lateSunday = new Date("2026-10-18T22:30:00Z")
    expect(mondayIndex(lateSunday, "Europe/Paris")).toBe(0)
    expect(mondayIndex(lateSunday, "America/New_York")).toBe(6)
  })
})
