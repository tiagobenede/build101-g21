import { describe, expect, it } from "vitest"

import { remainingWalk } from "./walk-progress"

const p = (lat: number, lng: number) => ({ lat, lng })

describe("remainingWalk", () => {
  const to = p(48.861, 2.36)
  const path = [p(48.858, 2.352), p(48.859, 2.354), p(48.86, 2.356), p(48.861, 2.358)]

  it("sin ruta es la línea recta", () => {
    expect(remainingWalk(p(48.858, 2.352), null, to)).toEqual([p(48.858, 2.352), to])
  })

  it("al salir, une tu posición con toda la ruta y el lugar", () => {
    const from = p(48.8579, 2.3519)
    expect(remainingWalk(from, path, to)).toEqual([from, ...path, to])
  })

  it("a mitad de camino, saca el tramo ya caminado", () => {
    const from = p(48.8601, 2.3561)
    expect(remainingWalk(from, path, to)).toEqual([from, path[2], path[3], to])
  })
})
