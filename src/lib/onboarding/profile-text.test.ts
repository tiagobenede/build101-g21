import { describe, expect, it } from "vitest"

import { MAX_STYLE_CHARS, onboardingStyleText } from "./profile-text"
import type { Insight } from "./schema"

const insight = (title: string, detail: string, why: string): Insight => ({
  question: 1,
  title,
  summary: title,
  detail,
  why,
  kind: "preference",
  avoid: false,
  interest: null,
  diet: null,
})

describe("onboardingStyleText", () => {
  it("incluye el detalle y el porqué de cada insight", () => {
    const text = onboardingStyleText([insight("Fan de los autos", "Le encantan los autos clásicos.", "Dijo que va a todos los museos de autos.")])
    expect(text).toContain("Fan de los autos: Le encantan los autos clásicos")
    expect(text).toContain("(Dijo que va a todos los museos de autos)")
  })

  it("null sin insights y con tope de largo", () => {
    expect(onboardingStyleText([])).toBeNull()
    const many = Array.from({ length: 20 }, (_, i) => insight(`T${i}`, "x".repeat(200), "y".repeat(100)))
    expect(onboardingStyleText(many)!.length).toBeLessThanOrEqual(MAX_STYLE_CHARS)
  })
})
