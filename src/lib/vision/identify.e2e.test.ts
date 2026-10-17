/**
 * Prueba de punta a punta de C-3 contra las APIs reales (Google Places, Jev, OpenAI)
 * y la base local. Cuesta plata, así que está apagada por defecto:
 *
 *   npm run test:vision                                  # imagen que no es ningún lugar
 *   VISION_PHOTO=~/fotos/vosges.jpg npm run test:vision  # una foto tuya (JPEG o PNG)
 *
 * Opcional: VISION_LAT / VISION_LNG (por defecto, Place des Vosges).
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"

import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// supabase-js pide WebSocket al crear el cliente; Node 20 no lo trae y acá no usamos Realtime.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}

const enabled = process.env.VISION_E2E === "1"
if (enabled) process.loadEnvFile(".env.local")

describe.skipIf(!enabled)("identifyPhoto (e2e, APIs reales)", () => {
  it("identifica la foto", async () => {
    const { ensureNearbyPlaces } = await import("@/lib/places/nearby")
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { distanceMeters, nearestPlaceLabel, walkMinutes } = await import("@/lib/geo")
    const { identifyPhoto } = await import("./identify")
    const { pickCandidates } = await import("./choose")

    const here = { lat: Number(process.env.VISION_LAT ?? 48.8556), lng: Number(process.env.VISION_LNG ?? 2.3655) }
    const photoPath = (process.env.VISION_PHOTO ?? "src/lib/vision/fixtures/no-es-un-lugar.jpg").replace(/^~/, homedir())
    const mime = photoPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"

    await ensureNearbyPlaces(here, "París")
    const { data, error } = await createAdminClient()
      .from("places")
      .select("id, name, category, tags, description, lat, lng, rating, typical_visit_minutes")
      .eq("city", "París")
      .eq("listed", true)
    if (error) throw new Error(error.message)

    const nearby = data
      .map((p) => ({ ...p, distanceMeters: distanceMeters(here, p), walkMinutes: walkMinutes(here, p) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
    // Lo mínimo de TravelerContext que usa identifyPhoto.
    const ctx = {
      nearby,
      location: here,
      locationLabel: nearestPlaceLabel(here, nearby, "París"),
      trip: { destination: "París" },
    } as unknown as Parameters<typeof identifyPhoto>[1]

    console.log(`\nFoto: ${photoPath}`)
    console.log(`Ubicación: ${ctx.locationLabel} (${here.lat}, ${here.lng})`)
    console.log(`Candidatos para Jev (≤ 250 m): ${pickCandidates(nearby).map((p) => `${p.name} (${Math.round(p.distanceMeters)} m)`).join(", ") || "ninguno"}`)

    const started = Date.now()
    const result = await identifyPhoto({ bytes: new Uint8Array(readFileSync(photoPath)), mime }, ctx)
    console.log(`\nRespondió: ${result.via === "jev" ? "Jev" : "LLM de respaldo"} en ${Date.now() - started} ms`)
    console.log(JSON.stringify(result, null, 2))

    expect(["jev", "llm"]).toContain(result.via)
  }, 30_000)
})
