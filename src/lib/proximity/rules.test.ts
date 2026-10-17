import { describe, expect, it } from "vitest"

import { eligible, inCooldown, pickRuleCandidate, reasonText, type Candidate, type Situation } from "./rules"

const HERE = { lat: 48.8556, lng: 2.3655 }
/** Punto a ~`m` metros al norte de HERE. */
const north = (m: number) => ({ lat: HERE.lat + m / 111_320, lng: HERE.lng })
const NOW = new Date("2026-10-17T14:00:00Z")

const tip = (id: string, m: number, recommender: string | null = "Camille"): Candidate => ({ kind: "local_tip", placeId: id, name: `Tip ${id}`, recommender, ...north(m) })
const item = (id: string, m: number, startsAt = "2026-10-17T16:00:00Z"): Candidate => ({ kind: "itinerary", placeId: id, name: `Plan ${id}`, startsAt, ...north(m) })
const liked = (id: string, m: number): Candidate => ({ kind: "interest", placeId: id, name: `Lugar ${id}`, category: "Café", matchedTags: ["café"], ...north(m) })

const situation = (over: Partial<Situation> = {}): Situation => ({
  position: HERE,
  now: NOW,
  notifiedPlaceIds: new Set(),
  lastNotifiedAt: null,
  cooldownMs: 60_000,
  nextLocked: null,
  ...over,
})

describe("pickRuleCandidate", () => {
  it("avisa de una recomendación a menos de 150 m", () => {
    expect(pickRuleCandidate([tip("a", 120)], situation())?.placeId).toBe("a")
    expect(pickRuleCandidate([tip("a", 170)], situation())).toBeNull()
  })

  it("prioriza recomendaciones sobre el plan, y después la más cercana", () => {
    expect(pickRuleCandidate([item("plan", 20), tip("lejos", 140), tip("cerca", 60)], situation())?.placeId).toBe("cerca")
  })

  it("nunca repite un lugar", () => {
    expect(pickRuleCandidate([tip("a", 50)], situation({ notifiedPlaceIds: new Set(["a"]) }))).toBeNull()
  })

  it("respeta la pausa entre avisos", () => {
    const s = situation({ lastNotifiedAt: new Date(NOW.getTime() - 30_000) })
    expect(inCooldown(s)).toBe(true)
    expect(pickRuleCandidate([tip("a", 50)], s)).toBeNull()
    expect(pickRuleCandidate([tip("a", 50)], situation({ lastNotifiedAt: new Date(NOW.getTime() - 61_000) }))?.placeId).toBe("a")
  })

  it("con una reserva en menos de 20 min, solo avisa de la reserva", () => {
    const nextLocked = { placeId: "clase", startsAt: "2026-10-17T14:15:00Z" }
    expect(pickRuleCandidate([tip("a", 50)], situation({ nextLocked }))).toBeNull()
    expect(pickRuleCandidate([tip("a", 50), item("clase", 100, nextLocked.startsAt)], situation({ nextLocked }))?.placeId).toBe("clase")
    // Una reserva en 2 horas no bloquea.
    expect(pickRuleCandidate([tip("a", 50)], situation({ nextLocked: { placeId: "clase", startsAt: "2026-10-17T16:00:00Z" } }))?.placeId).toBe("a")
  })

  it("los lugares por gustos no se avisan por regla (los decide Jev)", () => {
    expect(pickRuleCandidate([liked("x", 30)], situation())).toBeNull()
  })
})

describe("eligible", () => {
  it("los lugares por gustos van a menos de 100 m y después del resto", () => {
    const list = eligible([liked("cerca", 80), liked("lejos", 120), tip("t", 140)], situation())
    expect(list.map((c) => c.placeId)).toEqual(["t", "cerca"])
  })
})

describe("reasonText", () => {
  it("arma el texto según el tipo", () => {
    expect(reasonText(tip("a", 150), HERE, "Europe/Paris")).toBe("Estás a 2 min de Tip a, que te recomendó Camille.")
    expect(reasonText(tip("a", 150, null), HERE, "Europe/Paris")).toBe("Estás a 2 min de Tip a, que te recomendaron.")
    expect(reasonText(item("p", 50), HERE, "Europe/Paris")).toBe("Estás a 1 min de Plan p, lo tenés en el plan a las 18:00.")
    expect(reasonText(liked("x", 50), HERE, "Europe/Paris")).toBe("Estás a 1 min de Lugar x, va con lo que te gusta (café).")
  })
})
