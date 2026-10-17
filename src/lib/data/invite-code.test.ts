import { describe, expect, it } from "vitest"

import { newInviteCode } from "./invite-code"

describe("newInviteCode", () => {
  it("6 caracteres fáciles de dictar (sin 0, O, 1 ni I)", () => {
    for (let i = 0; i < 50; i++) expect(newInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  it("usa el azar que le pasan", () => {
    expect(newInviteCode(() => 0)).toBe("AAAAAA")
    expect(newInviteCode(() => 0.999)).toBe("999999")
  })
})
