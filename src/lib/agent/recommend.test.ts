import { describe, expect, it } from "vitest"

import { parseAvailableMinutes, replyTo } from "./recommend"
import type { AgentContext, Place } from "./types"

const place = (p: Partial<Place> & Pick<Place, "id" | "name" | "lat" | "lng">): Place => ({
  category: "Museo",
  tags: [],
  description: null,
  rating: 4.5,
  typical_visit_minutes: 20,
  ...p,
})

const POMPIDOU = { lat: 48.8606, lng: 2.3522 }

const places: Place[] = [
  place({ id: "arts", name: "Musée des Arts et Métiers", lat: 48.8667, lng: 2.3554, tags: ["autos", "historia"] }),
  place({ id: "louvre", name: "Louvre", lat: 48.8606, lng: 2.3376, tags: ["arte"], typical_visit_minutes: 90 }),
  place({ id: "market", name: "Marché des Enfants Rouges", lat: 48.8629, lng: 2.3618, tags: ["comida"] }),
  place({ id: "champs", name: "Campos Elíseos", lat: 48.8698, lng: 2.3076, tags: ["autos"] }),
]

const ctx = (over: Partial<AgentContext> = {}): AgentContext => ({
  firstName: "Sofía",
  interests: ["autos"],
  location: POMPIDOU,
  locationLabel: "Centre Pompidou, París",
  places,
  nextCommitment: null,
  now: new Date("2026-10-17T10:00:00Z"),
  timeZone: "Europe/Paris",
  alreadyRecommended: [],
  ...over,
})

describe("parseAvailableMinutes", () => {
  it.each([
    ["tengo 30 minutos", 30],
    ["tengo 45 min libres", 45],
    ["tengo media hora", 30],
    ["tengo una hora", 60],
    ["tengo hora y media", 90],
    ["tengo 2 horas", 120],
    ["tengo 1 hora y media", 90],
    ["¿qué hay cerca?", null],
  ])("%s → %s", (text, expected) => {
    expect(parseAvailableMinutes(text)).toBe(expected)
  })
})

describe("replyTo", () => {
  it("recomienda el lugar que matchea gustos y entra en el tiempo", () => {
    const reply = replyTo("Tengo 30 minutos, ¿qué hago?", ctx())
    expect(reply.availableMinutes).toBe(30)
    expect(reply.recommendations[0].place.id).toBe("arts")
    expect(reply.text).toContain("los autos")
    expect(reply.text).toContain("Musée des Arts et Métiers")
  })

  it("descarta lugares que no entran en el tiempo disponible", () => {
    const reply = replyTo("tengo 30 minutos", ctx())
    expect(reply.recommendations.map((r) => r.place.id)).not.toContain("champs")
  })

  it("prioriza lo que pide el mensaje por sobre los gustos guardados", () => {
    const reply = replyTo("tengo hambre, tengo 40 minutos", ctx())
    expect(reply.recommendations[0].place.id).toBe("market")
  })

  it("usa el próximo compromiso del itinerario si no se dice el tiempo", () => {
    const reply = replyTo(
      "¿qué hago ahora?",
      ctx({ nextCommitment: { title: "Almuerzo", startsAt: new Date("2026-10-17T10:45:00Z") } })
    )
    expect(reply.availableMinutes).toBe(30)
    expect(reply.text).toContain("Almuerzo")
  })

  it("no repite recomendaciones ya hechas si hay alternativas", () => {
    const reply = replyTo("tengo 30 minutos", ctx({ interests: ["autos", "arte"], alreadyRecommended: ["arts"] }))
    expect(reply.recommendations[0]?.place.id).not.toBe("arts")
  })

  it("responde un saludo mencionando los gustos", () => {
    const reply = replyTo("hola", ctx())
    expect(reply.recommendations).toHaveLength(0)
    expect(reply.text).toContain("Sofía")
  })

  it("prioriza los gustos en el orden que el usuario los cargó", () => {
    const pompidou = place({ id: "pompidou", name: "Centre Pompidou", lat: 48.8606, lng: 2.3522, tags: ["arquitectura", "diseño"] })
    const reply = replyTo("tengo 30 minutos", ctx({ interests: ["autos", "diseño", "arquitectura"], places: [...places, pompidou] }))
    expect(reply.recommendations[0].place.id).toBe("arts")
  })

  it("usa singular para 1 minuto", () => {
    const here = place({ id: "here", name: "Acá nomás", lat: 48.8607, lng: 2.3523, tags: ["autos"] })
    const reply = replyTo("tengo 30 minutos", ctx({ places: [here] }))
    expect(reply.text).toContain("a 1 minuto caminando")
  })

  it("avisa cuando no hay tiempo suficiente para nada", () => {
    const reply = replyTo("tengo 5 minutos", ctx())
    expect(reply.recommendations).toHaveLength(0)
    expect(reply.text.toLowerCase()).toContain("poco tiempo")
  })
})
