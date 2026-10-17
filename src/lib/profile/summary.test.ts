import { describe, expect, it } from "vitest"

import { compileProfileSummary, MAX_FACTS_IN_SUMMARY, type ProfileFact } from "./summary"

const fact = (statement: string, kind: ProfileFact["kind"] = "preference", polarity: 1 | -1 = 1): ProfileFact => ({
  kind,
  statement,
  polarity,
})

describe("compileProfileSummary", () => {
  it("agrupa restricciones, gustos y lo que evita", () => {
    expect(
      compileProfileSummary([
        fact("Es vegetariana.", "constraint"),
        fact("Le encantan los mercados"),
        fact("Museos de más de una hora", "preference", -1),
      ])
    ).toBe("No negociable: Es vegetariana. Le gusta: Le encantan los mercados. Evita: Museos de más de una hora.")
  })

  it("devuelve null sin hechos", () => {
    expect(compileProfileSummary([])).toBeNull()
  })

  it("se queda con los más nuevos y recorta los largos", () => {
    const facts = Array.from({ length: MAX_FACTS_IN_SUMMARY + 2 }, (_, i) => fact(`gusto ${i}`))
    facts[0] = fact("x".repeat(300))
    const summary = compileProfileSummary(facts)!
    expect(summary).not.toContain(`gusto ${MAX_FACTS_IN_SUMMARY}`)
    expect(summary).toContain("…")
    expect(summary.length).toBeLessThan(300)
  })
})
