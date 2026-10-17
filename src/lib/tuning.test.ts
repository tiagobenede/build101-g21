import { afterEach, describe, expect, it, vi } from "vitest"

describe("tuning", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("usa los valores por defecto", async () => {
    const { PROXIMITY, VISION } = await import("./tuning")
    expect(PROXIMITY.notifyRadiusMeters).toBe(150)
    expect(VISION.minJevConfidence).toBe(0.5)
  })

  it("una variable de entorno pisa el valor", async () => {
    vi.stubEnv("TUNE_NOTIFY_RADIUS_M", "200")
    vi.stubEnv("TUNE_VISION_MIN_CONFIDENCE", "0.7")
    const { PROXIMITY, VISION } = await import("./tuning")
    expect(PROXIMITY.notifyRadiusMeters).toBe(200)
    expect(VISION.minJevConfidence).toBe(0.7)
  })

  it("un valor inválido o vacío deja el valor por defecto", async () => {
    vi.stubEnv("TUNE_NOTIFY_RADIUS_M", "mucho")
    vi.stubEnv("TUNE_INTEREST_RADIUS_M", " ")
    const { PROXIMITY } = await import("./tuning")
    expect(PROXIMITY.notifyRadiusMeters).toBe(150)
    expect(PROXIMITY.interestRadiusMeters).toBe(100)
  })
})
