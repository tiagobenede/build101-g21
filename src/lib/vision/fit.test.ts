import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { fitForJev, JEV_MAX_SIDE, JEV_MIN_SIDE } from "./fit"

const image = async (width: number, height: number, format: "png" | "jpeg" = "jpeg") => {
  const img = sharp({ create: { width, height, channels: 3, background: "#c33" } })
  return { bytes: new Uint8Array(await (format === "png" ? img.png() : img.jpeg()).toBuffer()), mime: `image/${format}` as const }
}
const size = async (bytes: Uint8Array) => {
  const { width, height } = await sharp(bytes).metadata()
  return [width, height]
}

describe("fitForJev", () => {
  it("deja igual una foto que ya entra", async () => {
    const photo = await image(1024, 683)
    expect(await fitForJev(photo)).toBe(photo)
  })

  it("agranda una foto chica hasta el mínimo de Jev", async () => {
    const fitted = await fitForJev(await image(400, 267, "png"))
    expect(fitted.mime).toBe("image/png")
    const [w, h] = await size(fitted.bytes)
    expect(h).toBe(JEV_MIN_SIDE)
    expect(w).toBeGreaterThanOrEqual(419)
  })

  it("achica una foto grande hasta el máximo de Jev", async () => {
    const [w, h] = await size((await fitForJev(await image(4000, 3000))).bytes)
    expect([w, h]).toEqual([JEV_MAX_SIDE, 1176])
  })

  it("deja igual una foto que no puede cumplir los dos límites", async () => {
    const photo = await image(3000, 300)
    expect(await fitForJev(photo)).toBe(photo)
  })
})
