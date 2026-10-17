import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const callStructured = vi.fn()
vi.mock("@/lib/llm/structured", () => ({ callStructured: (...args: unknown[]) => callStructured(...args) }))

const { placeFacts } = await import("./facts")

describe("placeFacts", () => {
  beforeEach(() => callStructured.mockReset())

  it("devuelve como mucho 3 datos", async () => {
    callStructured.mockResolvedValue({ known: true, facts: ["a", "b", "c", "d"], anecdote: null })
    const r = await placeFacts("Centre Pompidou", null, "París")
    expect(r.facts).toEqual(["a", "b", "c"])
  })

  it("lo mismo sobre lo mismo sale de la caché", async () => {
    callStructured.mockResolvedValue({ known: false, facts: [], anecdote: null })
    await placeFacts("Fuente inventada", null, "París")
    await placeFacts("Fuente inventada", null, "París")
    expect(callStructured).toHaveBeenCalledTimes(1)
  })
})
