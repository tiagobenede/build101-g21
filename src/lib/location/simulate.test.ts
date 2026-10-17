import { describe, expect, it } from "vitest"

import { distanceMeters } from "@/lib/geo"

import { headingFromVector, shouldRefresh, shouldSendPing, stepPosition, WALK_SPEED_MPS } from "./simulate"

const POMPIDOU = { lat: 48.8606, lng: 2.3522 }

describe("stepPosition", () => {
  it("camina hacia el norte a velocidad de paso", () => {
    const next = stepPosition(POMPIDOU, { x: 0, y: 1 }, 10, 1)
    expect(next.lat).toBeGreaterThan(POMPIDOU.lat)
    expect(next.lng).toBeCloseTo(POMPIDOU.lng, 9)
    expect(distanceMeters(POMPIDOU, next)).toBeCloseTo(WALK_SPEED_MPS * 10, 0)
  })

  it("camina hacia el este y aplica el multiplicador", () => {
    const next = stepPosition(POMPIDOU, { x: 1, y: 0 }, 10, 5)
    expect(next.lng).toBeGreaterThan(POMPIDOU.lng)
    expect(distanceMeters(POMPIDOU, next)).toBeCloseTo(WALK_SPEED_MPS * 10 * 5, 0)
  })

  it("con el joystick a medias camina más lento", () => {
    const half = stepPosition(POMPIDOU, { x: 0, y: 0.5 }, 10, 1)
    expect(distanceMeters(POMPIDOU, half)).toBeCloseTo(WALK_SPEED_MPS * 5, 0)
  })

  it("no se mueve con el joystick en reposo", () => {
    expect(stepPosition(POMPIDOU, { x: 0, y: 0 }, 10, 20)).toEqual(POMPIDOU)
  })
})

describe("headingFromVector", () => {
  it.each([
    [{ x: 0, y: 1 }, 0],
    [{ x: 1, y: 0 }, 90],
    [{ x: 0, y: -1 }, 180],
    [{ x: -1, y: 0 }, 270],
  ])("%o → %d°", (vector, heading) => {
    expect(headingFromVector(vector)).toBeCloseTo(heading, 5)
  })
})

describe("shouldSendPing", () => {
  const at = (ms: number) => ms

  it("manda el primero siempre", () => {
    expect(shouldSendPing(null, POMPIDOU, at(0))).toBe(true)
  })

  it("manda si se movió 25 m aunque no pasaron 5 s", () => {
    const moved = stepPosition(POMPIDOU, { x: 0, y: 1 }, 20, 1) // 28 m
    expect(shouldSendPing({ position: POMPIDOU, at: at(0) }, moved, at(1_000))).toBe(true)
  })

  it("manda cada 5 s si se movió algo", () => {
    const moved = stepPosition(POMPIDOU, { x: 0, y: 1 }, 2, 1) // 2,8 m
    expect(shouldSendPing({ position: POMPIDOU, at: at(0) }, moved, at(5_000))).toBe(true)
    expect(shouldSendPing({ position: POMPIDOU, at: at(0) }, moved, at(4_000))).toBe(false)
  })

  it("no manda si está quieto", () => {
    expect(shouldSendPing({ position: POMPIDOU, at: at(0) }, POMPIDOU, at(60_000))).toBe(false)
  })
})

describe("shouldRefresh", () => {
  it("refresca al moverse 100 m o más", () => {
    expect(shouldRefresh(POMPIDOU, stepPosition(POMPIDOU, { x: 0, y: 1 }, 80, 1))).toBe(true) // 112 m
    expect(shouldRefresh(POMPIDOU, stepPosition(POMPIDOU, { x: 0, y: 1 }, 50, 1))).toBe(false) // 70 m
  })

  it("refresca la primera vez", () => {
    expect(shouldRefresh(null, POMPIDOU)).toBe(true)
  })
})
