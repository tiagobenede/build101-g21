import { describe, expect, it } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

import { MAX_PLACES_IN_CONTEXT } from "./config"
import { buildInstructions } from "./instructions"

const place = (i: number): NearbyPlace => ({
  id: `p${i}`,
  name: `Lugar ${i}`,
  category: "Museo",
  tags: ["autos"],
  description: null,
  lat: 0,
  lng: 0,
  rating: 4.5,
  typical_visit_minutes: 20,
  distanceMeters: i * 100,
  walkMinutes: i,
})

const base = {
  ctx: {
    firstName: "Sofía",
    interests: ["autos", "diseño"],
    travelStyle: null,
    locationLabel: "Centre Pompidou, París",
    nearby: Array.from({ length: 12 }, (_, i) => place(i + 1)),
  },
  now: new Date("2026-10-17T10:00:00Z"),
  timeZone: "Europe/Paris",
}

describe("buildInstructions", () => {
  it("incluye nombre, gustos y ubicación", () => {
    const text = buildInstructions({ ...base, nextCommitment: null })
    expect(text).toContain("Sofía")
    expect(text).toContain("autos, diseño")
    expect(text).toContain("Centre Pompidou, París")
    expect(text).toContain("12:00") // 10:00 UTC = 12:00 en París
  })

  it("limita la cantidad de lugares para ahorrar tokens", () => {
    const text = buildInstructions({ ...base, nextCommitment: null })
    expect(text).toContain(`Lugar ${MAX_PLACES_IN_CONTEXT}`)
    expect(text).not.toContain(`Lugar ${MAX_PLACES_IN_CONTEXT + 1} `)
  })

  it("menciona el próximo compromiso", () => {
    const text = buildInstructions({
      ...base,
      nextCommitment: { id: "i", title: "Almuerzo", notes: null, starts_at: "2026-10-17T11:00:00Z", ends_at: null, lat: null, lng: null },
    })
    expect(text).toContain('"Almuerzo" a las 13:00')
  })
})
