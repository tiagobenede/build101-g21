import { describe, expect, it } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

import { MAX_PLACES_IN_CONTEXT } from "./config"
import { buildInstructions } from "./instructions"

const PLANNED = { place_id: null, status: "planned", source: "user", locked: false } as const

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
    constraints: { dietary: [], mobility: null, dailyBudget: null, pace: null, schedule: null },
    profileSummary: null,
    itinerary: [
      { id: "a", title: "Desayuno", notes: null, starts_at: "2026-10-17T07:00:00Z", ends_at: "2026-10-17T08:00:00Z", lat: null, lng: null, ...PLANNED },
      { id: "b", title: "Louvre", notes: null, starts_at: "2026-10-17T13:00:00Z", ends_at: "2026-10-17T16:00:00Z", lat: null, lng: null, ...PLANNED },
      { id: "c", title: "Vuelo", notes: null, starts_at: "2026-10-18T09:00:00Z", ends_at: null, lat: null, lng: null, ...PLANNED },
    ],
  },
  weather: null,
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
      nextCommitment: { id: "i", title: "Almuerzo", notes: null, starts_at: "2026-10-17T11:00:00Z", ends_at: null, lat: null, lng: null, ...PLANNED },
    })
    expect(text).toContain('"Almuerzo" a las 13:00')
  })

  it("incluye el plan de hoy marcando lo que ya pasó, sin otros días", () => {
    const text = buildInstructions({ ...base, nextCommitment: null })
    expect(text).toContain("- [a] 09:00–10:00 Desayuno (ya pasó)")
    expect(text).toContain("- [b] 15:00–18:00 Louvre\n")
    expect(text).not.toContain("Vuelo")
  })

  it("incluye el clima si lo hay", () => {
    expect(buildInstructions({ ...base, nextCommitment: null, weather: "14°C, nublado." })).toContain("Clima: 14°C, nublado.")
    expect(buildInstructions({ ...base, nextCommitment: null })).not.toContain("Clima:")
  })

  it("incluye restricciones no negociables y lo aprendido", () => {
    const text = buildInstructions({
      ...base,
      nextCommitment: null,
      ctx: {
        ...base.ctx,
        constraints: { dietary: ["vegetariano"], mobility: "sin escaleras", dailyBudget: 80, pace: "tranquilo", schedule: null },
        profileSummary: "Evita: museos largos.",
      },
    })
    expect(text).toContain("No negociable: dieta vegetariano; movilidad: sin escaleras; presupuesto 80 € por día. Prefiere: ritmo tranquilo.")
    expect(text).toContain("Lo que aprendiste de Sofía: Evita: museos largos.")
  })

  it("sin restricciones no agrega la línea", () => {
    expect(buildInstructions({ ...base, nextCommitment: null })).not.toContain("No negociable:")
  })
})
