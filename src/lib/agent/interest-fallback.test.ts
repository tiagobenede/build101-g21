import { describe, expect, it } from "vitest"

import { interestQuery, tagWithInterest } from "./interest-fallback"

describe("interestQuery", () => {
  it("busca shoppings cuando pide compras", () => {
    expect(interestQuery("compras")).toBe("shopping centro comercial")
  })

  it("usa el tag tal cual si no tiene búsqueda propia", () => {
    expect(interestQuery("autos")).toBe("autos")
  })
})

describe("tagWithInterest", () => {
  it("suma el gusto pedido a los tags sin repetirlo", () => {
    const places = [
      { id: "a", tags: ["compras"] },
      { id: "b", tags: [] as string[] },
    ]
    expect(tagWithInterest(places, "compras").map((p) => p.tags)).toEqual([["compras"], ["compras"]])
  })

  it("no modifica los lugares originales", () => {
    const place = { id: "a", tags: ["arte"] }
    tagWithInterest([place], "compras")
    expect(place.tags).toEqual(["arte"])
  })
})
