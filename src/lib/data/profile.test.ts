import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { sameStatement } = await import("./profile")

describe("sameStatement", () => {
  it("ignora mayúsculas, tildes y puntuación", () => {
    expect(sameStatement("Le gustan mucho los autos clásicos.", "le gustan mucho los autos clasicos")).toBe(true)
    expect(sameStatement("Es vegetariana", "  Es   vegetariana!  ")).toBe(true)
  })

  it("distingue frases distintas", () => {
    expect(sameStatement("Le gustan los autos", "No le gustan los autos")).toBe(false)
  })
})
