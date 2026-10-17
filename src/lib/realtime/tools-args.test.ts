import { describe, expect, it } from "vitest"

import { fillMissingNulls, toolSchemas } from "./tools"

describe("fillMissingNulls", () => {
  it("completa con null lo que el modelo omitió (edit_itinerary sin item_ref ni title)", () => {
    const args = fillMissingNulls("edit_itinerary", {
      op: "add",
      place_name: "Museo Picasso de París",
      start_time: "17:30",
      end_time: null,
      date: null,
    })
    expect(toolSchemas.edit_itinerary.safeParse(args).success).toBe(true)
    expect(args).toMatchObject({ item_ref: null, title: null })
  })

  it("no inventa lo obligatorio ni pisa lo que vino", () => {
    const args = fillMissingNulls("remember", { statement: "Es vegetariana", kind: "constraint" }) as Record<string, unknown>
    expect(args.avoid).toBeUndefined()
    expect(args.diet).toBeNull()
    expect(toolSchemas.remember.safeParse(args).success).toBe(false)
    expect(fillMissingNulls("get_place", { place_name: "Louvre" })).toEqual({ place_name: "Louvre" })
  })
})

describe("remember con gusto", () => {
  it("acepta gustos de la lista y propios y, si faltan, queda null", () => {
    const withTag = { statement: "Le encantan los autos clásicos", kind: "preference", avoid: false, diet: null, interests: ["autos"] }
    expect(toolSchemas.remember.safeParse(withTag).success).toBe(true)
    expect(toolSchemas.remember.safeParse({ ...withTag, interests: ["McDonald's", "hospitales"] }).success).toBe(true)
    const filled = fillMissingNulls("remember", { statement: "Le encantan los autos", kind: "preference", avoid: false }) as Record<string, unknown>
    expect(filled.interests).toBeNull()
    expect(toolSchemas.remember.safeParse({ ...withTag, interests: ["x"] }).success).toBe(false)
  })
})
