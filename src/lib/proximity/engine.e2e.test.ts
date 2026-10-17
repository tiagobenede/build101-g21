/**
 * Prueba de punta a punta de C-6 contra la base local y Jev (y Google para cargar los
 * lugares de la zona), como Nicolas. Cuesta poco pero llama a APIs pagas, así que está
 * apagada por defecto:
 *
 *   npm run test:proximity
 *
 * Borra los avisos, recomendaciones y actividades de prueba que crea, y deja limpios
 * los avisos de Nicolas.
 */
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// supabase-js pide WebSocket al crear el cliente; Node 20 no lo trae y acá no usamos Realtime.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}

const enabled = process.env.PROXIMITY_E2E === "1"
if (enabled) {
  process.loadEnvFile(".env.local")
  // Sin pausa entre avisos para poder probar varios seguidos (se lee al importar el motor).
  process.env.NOTIFY_COOLDOWN_SECONDS = "0"
}

// 30 m al sur de la crêperie real, para no empatar con una recomendación guardada en el mismo punto.
const BREIZH = { id: "g:e2e-breizh", name: "Breizh Café (prueba)", lat: 48.8589, lng: 2.3627 }
const MARCHE = { id: "g:e2e-marche", name: "Marché des Enfants Rouges (prueba)", lat: 48.8628, lng: 2.3617 }
/** ~`m` metros al sur de un punto. */
const south = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat - m / 111_320, lng: p.lng })

describe.skipIf(!enabled)("checkProximity (e2e)", () => {
  it("avisa de lo que te recomendaron al pasar cerca, sin repetir ni distraer", async () => {
    const { checkProximity } = await import("./engine")
    const { ensureNearbyPlaces } = await import("@/lib/places/nearby")
    const { createAdminClient } = await import("@/lib/supabase/admin")

    const admin = createAdminClient()
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    const { data: auth, error: authError } = await db.auth.signInWithPassword({ email: "nicolas@rumbo.demo", password: "rumbo-demo-2026" })
    if (authError) throw authError
    const me = auth.user.id
    const { data: trip } = await db.from("trips").select("id").limit(1).single()

    const check = async (title: string, at: { lat: number; lng: number }) => {
      const started = Date.now()
      const n = await checkProximity(db, me, at)
      console.log(`${title.padEnd(52)} ${String(Date.now() - started).padStart(5)} ms → ${n ? `[${n.candidate_type}] ${n.reason_text}` : "sin aviso"}`)
      return n
    }

    await admin.from("places").upsert([
      { ...BREIZH, category: "Restaurante", city: "París", listed: false, typical_visit_minutes: 45 },
      { ...MARCHE, category: "Mercado", city: "París", listed: false, typical_visit_minutes: 40 },
    ])
    await db.from("notifications").delete().eq("user_id", me)
    const { data: tips } = await db
      .from("local_tips")
      .insert([
        { user_id: me, place_id: BREIZH.id, place_name_raw: "Breizh Café", what: "Galettes sin gluten", recommender: "Camille, la de la panadería", status: "saved" },
        { user_id: me, place_id: MARCHE.id, place_name_raw: "Marché des Enfants Rouges", what: "Comer en el mercado", recommender: "Camille", status: "saved" },
      ])
      .select("id")
    let lockedId: string | null = null

    try {
      console.log("")
      const far = await check("1. A 400 m de la crêperie", south(BREIZH, 400))
      expect(far?.place_id).not.toBe(BREIZH.id)
      await db.from("notifications").delete().eq("user_id", me)

      const near = await check("2. A 100 m de la crêperie", south(BREIZH, 100))
      expect(near?.candidate_type).toBe("local_tip")
      expect(near?.reason_text).toMatch(/Breizh Café \(prueba\), que te recomendó Camille/)

      const again = await check("3. Otra vez en el mismo lugar", south(BREIZH, 100))
      expect(again?.place_id).not.toBe(BREIZH.id)
      await db.from("notifications").delete().eq("user_id", me).neq("place_id", BREIZH.id)

      const { data: locked } = await db
        .from("itinerary_items")
        .insert({ trip_id: trip!.id, title: "Clase de cocina (prueba)", starts_at: new Date(Date.now() + 10 * 60_000).toISOString(), locked: true, lat: 48.865, lng: 2.36 })
        .select("id")
        .single()
      lockedId = locked!.id as string
      const blocked = await check("4a. Cerca del mercado, con una reserva en 10 min", south(MARCHE, 80))
      expect(blocked).toBeNull()
      await db.from("itinerary_items").delete().eq("id", lockedId)
      lockedId = null
      const free = await check("4b. Cerca del mercado, sin la reserva", south(MARCHE, 80))
      expect(free?.place_id).toBe(MARCHE.id)

      // 6. Por gustos, con opciones controladas en un lugar aislado (Bois de Vincennes).
      const woods = { lat: 48.835, lng: 2.435 }
      const north = (m: number) => ({ lat: woods.lat + m / 111_320, lng: woods.lng })
      await admin.from("places").upsert([
        { id: "g:e2e-mercado", name: "Marché couvert (prueba)", category: "Mercado", tags: ["mercados", "comida"], rating: 4.8, description: "Mercado cubierto con puestos de comida, frutas y quesos.", city: "París", ...north(30) },
        { id: "g:e2e-cafe", name: "Café de paso (prueba)", category: "Café", tags: ["café"], rating: 3.6, description: "Café al paso, nada especial.", city: "París", ...north(60) },
      ])
      await db.from("notifications").delete().eq("user_id", me)
      const good = await check("6a. Mercado 4,8★ a 30 m y café 3,6★ (debería avisar)", woods)
      expect(good?.place_id).toBe("g:e2e-mercado")

      // Primero los avisos: apuntan a los lugares y no dejarían borrarlos.
      await db.from("notifications").delete().eq("user_id", me)
      await admin.from("places").delete().in("id", ["g:e2e-mercado", "g:e2e-cafe"])
      await admin.from("places").upsert({
        id: "g:e2e-boulangerie",
        name: "Boulangerie (prueba)",
        category: "Panadería",
        tags: ["comida", "café"],
        rating: 4.7,
        description: "Panadería famosa por sus baguettes y croissants de trigo.",
        city: "París",
        ...north(40),
      })
      await db.from("profiles").update({ dietary: ["celíaca"] }).eq("id", me)
      await db.from("notifications").delete().eq("user_id", me)
      const celiac = await check("6b. Celíaca, solo una panadería de trigo (no debería)", woods)
      await db.from("profiles").update({ dietary: [] }).eq("id", me)
      await db.from("notifications").delete().eq("user_id", me)
      await admin.from("places").delete().eq("id", "g:e2e-boulangerie")
      expect(celiac).toBeNull()

      // 5. Por gustos: en el Marais, rodeada de restaurantes y cafés (lugares reales de Google).
      const marais = { lat: 48.8573, lng: 2.3591 }
      await ensureNearbyPlaces(marais, "París")
      await db.from("notifications").delete().eq("user_id", me)
      const liked = await check("5. En el Marais, entre restaurantes (decide Jev)", marais)
      expect(liked === null || liked.candidate_type === "interest").toBe(true)
    } finally {
      if (lockedId) await db.from("itinerary_items").delete().eq("id", lockedId)
      await db.from("notifications").delete().eq("user_id", me)
      await db.from("profiles").update({ dietary: [] }).eq("id", me)
      if (tips) await db.from("local_tips").delete().in("id", tips.map((t) => t.id))
      await admin.from("places").delete().in("id", [BREIZH.id, MARCHE.id, "g:e2e-mercado", "g:e2e-cafe", "g:e2e-boulangerie"])
    }
  }, 60_000)
})
