import { describe, expect, it } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

import { MAX_PLACES_IN_CONTEXT } from "./config"
import { buildInstructions, companionsLine, formatTodayPlan, localTipsLine, locationLine, nowLine } from "./instructions"

const PLANNED = { place_id: null, status: "planned", source: "user", locked: false, created_by: null } as const

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
    nearby: Array.from({ length: 30 }, (_, i) => place(i + 1)),
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

  it("dice el día, la fecha y el momento del día en la zona del viaje", () => {
    const text = buildInstructions({ ...base, nextCommitment: null })
    expect(text).toContain("sábado 17 de octubre, 12:00 (mediodía)")
    // 23:30 UTC del 17 = 01:30 del domingo en París.
    expect(nowLine(new Date("2026-10-17T23:30:00Z"), "Europe/Paris")).toBe("domingo 18 de octubre, 01:30 (madrugada)")
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

  it("le dice al agente que lo que devuelven sus tools está en pantalla", () => {
    const text = buildInstructions({ ...base, nextCommitment: null })
    expect(text).toContain("aparece en la pantalla del viajero")
    expect(text).toContain("nunca digas que no encontraste nada si el tool devolvió lugares")
  })
})

describe("localTipsLine", () => {
  it("junta lugar, qué, por qué y quién", () => {
    expect(
      localTipsLine([
        { placeName: "Marché couvert des Enfants Rouges", what: "Comer cuscús.", why: "Dice que es excelente.", recommender: "Camille" },
        { placeName: "Pain de Sucre", what: "Ir por el postre", why: null, recommender: null },
      ])
    ).toBe(
      'Te recomendaron gente del lugar, con el traductor: Marché couvert des Enfants Rouges: Comer cuscús (Dice que es excelente), según Camille; Pain de Sucre: Ir por el postre. Si viene al caso, retomalo ("lo que te dijo…").'
    )
  })

  it("sin recomendaciones no hay línea", () => {
    expect(localTipsLine([])).toBeNull()
  })
})

describe("locationLine", () => {
  it("sin dirección deja solo el lugar cercano", () => {
    expect(locationLine("París", null)).toBe("París.")
  })

  it("suma la calle y el barrio al lugar cercano", () => {
    expect(locationLine("Centre Pompidou", "Rue Rambuteau, Saint-Merri, París")).toBe(
      "cerca de Centre Pompidou (está en Rue Rambuteau, Saint-Merri, París)."
    )
  })

  it("sin lugar cerca, la ciudad no se repite", () => {
    expect(locationLine("París", "Rue Meissonier, Paris 17e Arrondissement, París")).toBe(
      "Rue Meissonier, Paris 17e Arrondissement, París."
    )
  })

  it("no repite el lugar si la dirección ya lo incluye", () => {
    expect(locationLine("Place des Vosges", "Place des Vosges, Quartier de l'Arsenal, París")).toBe(
      "Place des Vosges, Quartier de l'Arsenal, París."
    )
  })

  it("llega a las instrucciones", () => {
    const text = buildInstructions({ ...base, nextCommitment: null, address: "Rue Rambuteau, Saint-Merri, París" })
    expect(text).toContain("está en Rue Rambuteau, Saint-Merri, París")
  })
  it("incluye la esquina y las coordenadas, y cómo responder dónde está", () => {
    const where = "Sobre Rue Rambuteau, a 70 m de la esquina con Rue Beaubourg (Beaubourg, París). Coordenadas: 48.86060, 2.35220."
    const text = buildInstructions({ ...base, nextCommitment: null, where })
    expect(text).toContain(`Dónde está exacto: ${where}`)
    expect(text).toContain("where_am_i")
  })

  it("sin esos datos, no deja la línea vacía", () => {
    expect(buildInstructions({ ...base, nextCommitment: null })).not.toContain("Dónde está exacto")
  })
})

describe("viaje compartido", () => {
  const sofia = { userId: "u-sofia", fullName: "Sofía Álvarez", firstName: "Sofía", role: "member" as const, dietary: ["vegetariano"], mobility: null }
  const mateo = { userId: "u-mateo", fullName: "Mateo Rossi", firstName: "Mateo", role: "member" as const, dietary: [], mobility: null }

  it("dice con quién viaja y lo que no negocia cada uno", () => {
    expect(companionsLine([sofia, mateo])).toMatch(/^Viaje compartido con Sofía \(vegetariano\), Mateo:/)
    expect(companionsLine([sofia], "Lucía")).toContain("lo que no lo dice lo sumó Lucía")
    expect(companionsLine([])).toBeNull()
  })

  it("el plan marca lo que sumó otra persona", () => {
    const now = new Date("2026-10-17T10:00:00Z")
    const item = (id: string, createdBy: string | null) => ({
      ...PLANNED,
      id,
      title: `Actividad ${id}`,
      notes: null,
      starts_at: "2026-10-17T14:00:00Z",
      ends_at: null,
      lat: null,
      lng: null,
      created_by: createdBy,
    })
    const plan = formatTodayPlan([item("aaaaaaaa1", "u-sofia"), item("bbbbbbbb2", "u-yo")], now, "Europe/Paris", new Map([["u-sofia", "Sofía"]]))
    expect(plan).toContain("Actividad aaaaaaaa1 (sumó Sofía)")
    expect(plan).not.toContain("Actividad bbbbbbbb2 (sumó")
  })
})
