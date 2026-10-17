import { describe, expect, it } from "vitest"

import { fitSize } from "./resize"

describe("fitSize", () => {
  it("achica el lado mayor a 1024 manteniendo la proporción", () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 1024, height: 768 })
    expect(fitSize(1080, 1920)).toEqual({ width: 576, height: 1024 })
  })

  it("no agranda fotos chicas", () => {
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 })
  })
})
