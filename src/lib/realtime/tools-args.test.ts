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
