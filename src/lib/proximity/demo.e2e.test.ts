/**
 * Ensayo de la demo (docs/pitch/casos-jurado.md) contra la base local y APIs pagas.
 * Temporal: DEMO_E2E=1 npx vitest run src/lib/proximity/demo.e2e.test.ts
 */
import { createClient } from "@supabase/supabase-js"
import { describe, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}

const enabled = process.env.DEMO_E2E === "1"
if (enabled) {
  process.loadEnvFile(".env.local")
  process.env.NOTIFY_COOLDOWN_SECONDS = "0"
}

const PIRAMIDE = { lat: 48.86105, lng: 2.33698 }
const UNION_SQUARE = { lat: 40.7359, lng: -73.9911 }

describe.skipIf(!enabled)("demo", () => {
  it("escenas 2, 3 y 5", async () => {
    // 15:30 en París (13:30 UTC del 18/10), para ensayar a la hora de un día normal.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-18T13:30:00Z"))
    const { checkProximity } = await import("./engine")
    const { ensureNearbyPlaces } = await import("@/lib/places/nearby")
    const { searchPlaces } = await import("@/lib/places/search")
    const { fetchParisEvents } = await import("@/lib/events/paris")
    const { rankPlaces } = await import("@/lib/agent/rank")
    const { walkMinutes, distanceMeters } = await import("@/lib/geo")

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    const { data: auth, error } = await db.auth.signInWithPassword({ email: "lucas@rumbo.demo", password: "rumbo-demo-2026" })
    if (error) throw error
    const me = auth.user.id

    // Escena 3: el Louvre fuera del plan (la base local es anterior al cambio del seed).
    const { data: removed } = await db.from("itinerary_items").delete().ilike("title", "%louvre%").select("title")
    console.log("\n[plan] sacados:", removed?.map((r) => r.title))
    await db.from("notifications").delete().eq("user_id", me)
    await ensureNearbyPlaces(PIRAMIDE, "París")
    const { data: near } = await db.from("places").select("*").eq("listed", true)
      .gte("lat", PIRAMIDE.lat - 0.004).lte("lat", PIRAMIDE.lat + 0.004)
      .gte("lng", PIRAMIDE.lng - 0.006).lte("lng", PIRAMIDE.lng + 0.006)
    const louvre = near?.filter((p) => /louvre/i.test(p.name as string))
    console.log("[louvre] en places:", louvre?.map((p) => `${p.name} [${(p.tags as string[]).join(",")}] a ${Math.round(distanceMeters(PIRAMIDE, p as { lat: number; lng: number }))} m`))
    const n = await checkProximity(db, me, PIRAMIDE)
    console.log("[aviso]", n ? `[${n.candidate_type}] ${n.reason_text}` : "sin aviso")
    await db.from("notifications").delete().eq("user_id", me)

    // Escena 5: hora y media libre al salir del Louvre.
    const { data: interests } = await db.from("interests").select("tag").eq("user_id", me)
    const ranked = rankPlaces({
      places: (near ?? []).map((p) => ({ ...p, walkMinutes: walkMinutes(PIRAMIDE, p as { lat: number; lng: number }) })) as never,
      interests: (interests ?? []).map((i) => i.tag as string),
      requestedTag: null,
      availableMinutes: 90,
      maxWalkMinutes: 20,
      alreadyRecommended: louvre?.map((p) => p.id as string) ?? [],
    })
    console.log("[hora y media] lugares:", ranked.map((r) => `${r.place.name} (${r.place.tags.join(",")}) ${r.walkMinutes ?? ""}`))
    const nowParis = new Date()
    for (const [label, now] of [["15:30", nowParis]] as const) {
      const events = await fetchParisEvents({ near: PIRAMIDE, when: "now", kind: null, freeOnly: false, now, timeZone: "Europe/Paris" })
      console.log(`[hora y media] eventos ${label}:`, events.map((e) => `${e.title} @ ${e.venue} ${e.startsAt}`))
    }

    // Escena 2: bagels en Manhattan.
    const bagels = await searchPlaces("bagels", null, UNION_SQUARE, "Nueva York", { maxWalkMinutes: 10 })
    console.log("[bagels]", bagels.map((p) => `${p.name} ${p.rating ?? "-"}★ ${p.walkMinutes} min, abierto: ${p.openNow}`))
  }, 120_000)
})
