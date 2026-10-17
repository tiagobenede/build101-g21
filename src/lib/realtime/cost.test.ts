import { describe, expect, it } from "vitest"

import { estimateUsageCost } from "./cost"

const price = { text_in: 1, audio_in: 10, cached_in: 0.1, text_out: 2, audio_out: 20 }

describe("estimateUsageCost", () => {
  it("devuelve 0 sin usage", () => {
    expect(estimateUsageCost(undefined, price)).toBe(0)
  })

  it("cobra lo cacheado a precio de cache y no dos veces", () => {
    const cost = estimateUsageCost(
      {
        input_token_details: {
          text_tokens: 1000,
          audio_tokens: 500,
          cached_tokens: 800,
          cached_tokens_details: { text_tokens: 800, audio_tokens: 0 },
        },
        output_token_details: { text_tokens: 50, audio_tokens: 1000 },
      },
      price
    )
    // 200*1 + 500*10 + 800*0.1 + 50*2 + 1000*20 = 25380 → /1M
    expect(cost).toBeCloseTo(0.02538, 6)
  })
})
