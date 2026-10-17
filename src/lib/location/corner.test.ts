import { describe, expect, it } from "vitest"

import { cornerPairs, parseIntersection, pickCorner, routesFromReverse, whereLine, type Where } from "./corner"

const route = (name: string) => ({ address_components: [{ long_name: name, types: ["route"] }] })

describe("routesFromReverse", () => {
  it("junta las calles de todos los resultados, sin repetir y en orden", () => {
    const raw = {
      status: "OK",
      results: [route("Rue Rambuteau"), route("Rue Beaubourg"), { address_components: [{ long_name: "París", types: ["locality"] }] }, route("Rue Beaubourg")],
    }
    expect(routesFromReverse(raw)).toEqual(["Rue Rambuteau", "Rue Beaubourg"])
  })

  it("devuelve vacío si la respuesta no sirve", () => {
    expect(routesFromReverse({ status: "ZERO_RESULTS", results: [] })).toEqual([])
    expect(routesFromReverse("basura")).toEqual([])
  })
})

describe("parseIntersection", () => {
  it("toma el punto cuando Google lo reconoce como esquina", () => {
    const raw = { status: "OK", results: [{ types: ["intersection"], geometry: { location: { lat: 48.86122, lng: 2.35351 } } }] }
    expect(parseIntersection(raw)).toEqual({ lat: 48.86122, lng: 2.35351 })
  })

  it("descarta lo que no es una esquina (Google devolvió solo una de las calles)", () => {
    const raw = { status: "OK", results: [{ types: ["route"], geometry: { location: { lat: 1, lng: 2 } } }] }
    expect(parseIntersection(raw)).toBeNull()
  })
})

describe("cornerPairs", () => {
  it("cruza la calle principal con las otras", () => {
    expect(cornerPairs(["A", "B", "C"])).toEqual([
      ["A", "B"],
      ["A", "C"],
    ])
  })

  it("sin dos calles no hay esquina posible", () => {
    expect(cornerPairs(["A"])).toEqual([])
  })
})

describe("pickCorner", () => {
  const here = { lat: 48.8606, lng: 2.3522 }

  it("elige la esquina más cercana", () => {
    const corner = pickCorner(here, [
      { streets: ["Rue Rambuteau", "Rue Saint-Martin"], at: { lat: 48.86166, lng: 2.35171 } },
      { streets: ["Rue Rambuteau", "Rue Beaubourg"], at: { lat: 48.86122, lng: 2.35351 } },
    ])
    // Beaubourg a ~118 m, Saint-Martin a ~123 m.
    expect(corner?.streets).toEqual(["Rue Rambuteau", "Rue Beaubourg"])
    expect(corner?.meters).toBeGreaterThan(110)
    expect(corner?.meters).toBeLessThan(122)
  })

  it("ignora esquinas lejanas (Google encontró otro cruce en la ciudad)", () => {
    expect(pickCorner(here, [{ streets: ["A", "B"], at: { lat: 48.9, lng: 2.4 } }])).toBeNull()
  })
})

describe("whereLine", () => {
  const base: Where = { location: { lat: 48.860601, lng: 2.352204 }, street: "Rue Rambuteau", barrio: "Beaubourg", city: "París", corner: null }

  it("en la esquina misma", () => {
    const text = whereLine({ ...base, corner: { streets: ["Rue Rambuteau", "Rue Beaubourg"], at: base.location, meters: 12 } })
    expect(text).toBe("En la esquina de Rue Rambuteau y Rue Beaubourg (Beaubourg, París). Coordenadas: 48.86060, 2.35220.")
  })

  it("sobre una calle, cerca de una esquina", () => {
    const text = whereLine({ ...base, corner: { streets: ["Rue Rambuteau", "Rue Beaubourg"], at: base.location, meters: 74 } })
    expect(text).toBe("Sobre Rue Rambuteau, a 70 m de la esquina con Rue Beaubourg (Beaubourg, París). Coordenadas: 48.86060, 2.35220.")
  })

  it("sin esquina conocida, dice solo la calle", () => {
    expect(whereLine(base)).toBe("Sobre Rue Rambuteau (Beaubourg, París). Coordenadas: 48.86060, 2.35220.")
  })

  it("sin calle, al menos las coordenadas", () => {
    expect(whereLine({ ...base, street: null, barrio: null, city: null })).toBe("Coordenadas: 48.86060, 2.35220.")
  })
})
