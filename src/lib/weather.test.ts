import { describe, expect, it } from "vitest"

import { summarizeForecast } from "./weather"

const hourly = (probs: number[]) => ({
  time: probs.map((_, i) => `2026-10-17T${String(14 + i).padStart(2, "0")}:00`),
  precipitation_probability: probs,
})

describe("summarizeForecast", () => {
  it("describe el clima actual", () => {
    expect(summarizeForecast({ current: { temperature_2m: 14.4, weather_code: 3 }, hourly: hourly([0, 10]) })).toBe("14°C, nublado.")
  })

  it("avisa la primera hora con lluvia probable", () => {
    expect(summarizeForecast({ current: { temperature_2m: 14, weather_code: 2 }, hourly: hourly([10, 30, 70, 90]) })).toBe(
      "14°C, algo nublado. Probable lluvia a las 16 (70%)."
    )
  })

  it("si ya llueve no repite el aviso, y sin datos devuelve null", () => {
    expect(summarizeForecast({ current: { temperature_2m: 11, weather_code: 61 }, hourly: hourly([90]) })).toBe("11°C, lloviendo.")
    expect(summarizeForecast({})).toBeNull()
  })
})
