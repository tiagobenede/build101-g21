import webpush from "web-push"
import { describe, expect, it } from "vitest"

import { enqueue, vapidKeyToBytes, type ShownNotification } from "./queue"

const n = (id: string, createdAt: number): ShownNotification => ({
  id,
  placeId: `g:${id}`,
  placeName: "Breizh Café",
  category: "Restaurante",
  reason: "Estás a 2 min de Breizh Café, que te recomendó Camille.",
  createdAt,
})

describe("enqueue", () => {
  it("agrega en orden de llegada y sin duplicados", () => {
    const queue = enqueue(enqueue([n("b", 2)], n("a", 1)), n("b", 2))
    expect(queue.map((q) => q.id)).toEqual(["a", "b"])
  })
})

describe("vapidKeyToBytes", () => {
  it("convierte una clave VAPID real a los 65 bytes de una clave pública P-256", () => {
    const { publicKey } = webpush.generateVAPIDKeys()
    const bytes = vapidKeyToBytes(publicKey)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(0x04) // punto sin comprimir
    expect(Buffer.from(bytes).toString("base64url")).toBe(publicKey)
  })
})
