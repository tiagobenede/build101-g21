import { describe, expect, it } from "vitest"

import { buildWhere, eventWindow, firstOccurrenceIn, parseOccurrences, pickEvents, type QfapRecord } from "./paris"

const TZ = "Europe/Paris"
// Sábado 17 de octubre de 2026, 16:00 en París (horario de verano, UTC+2).
const NOW = new Date("2026-10-17T14:00:00Z")

const record = (over: Partial<QfapRecord>): QfapRecord => ({
  id: "1",
  title: "Concierto",
  lead_text: "Jazz en vivo",
  url: null,
  date_start: null,
  date_end: null,
  occurrences: null,
  address_name: "38Riv",
  qfap_tags: "Concert",
  price_type: "payant",
  lat_lon: { lat: 48.85, lon: 2.35 },
  ...over,
})

describe("eventWindow", () => {
  it("now = las próximas 3 horas", () => {
    const w = eventWindow("now", NOW, TZ)
    expect(w.from).toEqual(NOW)
    expect(w.to.toISOString()).toBe("2026-10-17T17:00:00.000Z")
  })

  it("today = hasta la medianoche de París", () => {
    expect(eventWindow("today", NOW, TZ).to.toISOString()).toBe("2026-10-17T22:00:00.000Z")
  })

  it("tomorrow = el día siguiente entero, también si cruza el cambio de horario", () => {
    const w = eventWindow("tomorrow", new Date("2026-10-24T20:00:00Z"), TZ)
    expect(w.from.toISOString()).toBe("2026-10-24T22:00:00.000Z")
    // El 25 de octubre vuelve el horario de invierno (UTC+1).
    expect(w.to.toISOString()).toBe("2026-10-25T23:00:00.000Z")
  })
})

describe("parseOccurrences", () => {
  it("toma la hora de pared de París aunque el offset esté mal", () => {
    const [o] = parseOccurrences("2027-01-19T20:00:00+02:00_2027-01-19T21:10:00+02:00", TZ)
    // En enero París es UTC+1: 20:00 local = 19:00Z.
    expect(o.start.toISOString()).toBe("2027-01-19T19:00:00.000Z")
    expect(o.end.toISOString()).toBe("2027-01-19T20:10:00.000Z")
  })

  it("ignora lo vacío o mal formado", () => {
    expect(parseOccurrences(null, TZ)).toEqual([])
    expect(parseOccurrences("basura;2026-10-17T14:00:00+02:00", TZ)).toEqual([])
  })
})

describe("firstOccurrenceIn", () => {
  it("cuenta lo que ya empezó y no terminó, y elige la más temprana", () => {
    const occ = parseOccurrences(
      "2026-10-17T20:00:00+02:00_2026-10-17T22:00:00+02:00;2026-10-17T14:00:00+02:00_2026-10-17T21:00:00+02:00",
      TZ
    )
    expect(firstOccurrenceIn(occ, eventWindow("now", NOW, TZ))?.start.toISOString()).toBe("2026-10-17T12:00:00.000Z")
  })

  it("descarta lo que ya terminó", () => {
    const occ = parseOccurrences("2026-10-17T10:00:00+02:00_2026-10-17T12:00:00+02:00", TZ)
    expect(firstOccurrenceIn(occ, eventWindow("today", NOW, TZ))).toBeNull()
  })
})

describe("pickEvents", () => {
  const tonight = "2026-10-17T20:00:00+02:00_2026-10-17T22:00:00+02:00"

  it("solo con función en la ventana y con lugar, hasta 3, en el orden dado", () => {
    const records = [
      record({ id: "a", occurrences: tonight, price_type: "gratuit", qfap_tags: "Concert;Festival" }),
      record({ id: "b", occurrences: tonight, address_name: null }),
      record({ id: "c", occurrences: "2026-11-01T20:00:00+02:00_2026-11-01T22:00:00+02:00" }),
      record({ id: "d", occurrences: tonight }),
      record({ id: "e", occurrences: tonight }),
      record({ id: "f", occurrences: tonight }),
    ]
    const events = pickEvents(records, eventWindow("today", NOW, TZ), TZ)
    expect(events.map((e) => e.id)).toEqual(["a", "d", "e"])
    expect(events[0]).toMatchObject({ free: true, tags: ["Concert", "Festival"], startsAt: "2026-10-17T18:00:00.000Z" })
  })
})

describe("buildWhere", () => {
  it("filtra zona y fechas con margen, y tipo y gratis si se piden", () => {
    const where = buildWhere({ lat: 48.86, lng: 2.35 }, eventWindow("now", NOW, TZ), "música", true)
    expect(where).toContain(`date_end >= "2026-10-17T11:00:00.000Z"`)
    expect(where).toContain(`date_start <= "2026-10-17T20:00:00.000Z"`)
    expect(where).toContain("POINT(2.35 48.86)")
    expect(where).toContain(`(qfap_tags like "%Concert%" OR qfap_tags like "%Spectacle musical%")`)
    expect(where).toContain(`price_type = "gratuit"`)
  })

  it("sin tipo ni gratis no los agrega", () => {
    const where = buildWhere({ lat: 48.86, lng: 2.35 }, eventWindow("today", NOW, TZ), null, false)
    expect(where).not.toContain("qfap_tags")
    expect(where).not.toContain("price_type")
  })
})
