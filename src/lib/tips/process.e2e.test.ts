/**
 * Prueba de punta a punta de C-5 contra las APIs reales (OpenAI, Google Places) y la base
 * local, logueado como Lucía. Cuesta plata, así que está apagada por defecto:
 *
 *   npm run test:tips
 *
 * Arma una charla traducida en la que Camille recomienda en francés dos lugares (la
 * traducción deforma los nombres), menciona el Louvre sin recomendarlo y tira un consejo
 * genérico. Tienen que salir las dos recomendaciones, ancladas, y ninguna más.
 */
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// supabase-js pide WebSocket al crear el cliente; Node 20 no lo trae y acá no usamos Realtime.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}

const enabled = process.env.TIPS_E2E === "1"
if (enabled) process.loadEnvFile(".env.local")

const VOSGES = { lat: 48.8556, lng: 2.3655 }

const CHARLA = [
  ["user", "es", "Hola, ¿qué me recomendás para comer por acá? Soy celíaca.", "Bonjour, qu'est-ce que vous me conseillez pour manger par ici ? Je suis cœliaque."],
  [
    "local",
    "fr",
    "Bonjour ! Moi c'est Camille, je travaille à la boulangerie d'à côté. Pour vous, allez au Breizh Café, rue Vieille du Temple : les galettes de sarrasin sont sans gluten.",
    "¡Hola! Soy Camille, trabajo en la panadería de al lado. Para vos, andá al Brest Café, en la calle Vieja del Templo: las galletas de alforfón no tienen gluten.",
  ],
  ["user", "es", "¿Y el Louvre vale la pena?", "Et le Louvre, ça vaut le coup ?"],
  [
    "local",
    "fr",
    "Le Louvre, bof, trop de monde. Mais le Marché des Enfants Rouges, le samedi matin, c'est génial, et pas cher, une dizaine d'euros.",
    "El Louvre, meh, demasiada gente. Pero el mercado de los Niños Rojos, el sábado a la mañana, es genial, y barato, unos diez euros.",
  ],
  ["local", "fr", "Et mangez des crêpes, en général, c'est la Bretagne à Paris !", "¡Y coman crepas, en general, es Bretaña en París!"],
] as const

describe.skipIf(!enabled)("extractConversationTips (e2e, APIs reales)", () => {
  it("saca las recomendaciones de Camille, ancladas", async () => {
    const { extractConversationTips } = await import("./process")
    const { addTipToPlan } = await import("@/lib/data/tips")
    const { removeItineraryItem } = await import("@/lib/data/itinerary")

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    const { data: auth, error: authError } = await db.auth.signInWithPassword({ email: "lucia@rumbo.demo", password: "rumbo-demo-2026" })
    if (authError) throw authError

    const { data: conversation, error } = await db
      .from("conversations")
      .insert({ user_id: auth.user.id, kind: "translation", lang_pair: "es-fr", ...VOSGES, ended_at: new Date().toISOString() })
      .select("id, user_id, trip_id, lat, lng, lang_pair")
      .single()
    if (error) throw error

    try {
      const { error: msgError } = await db.from("messages").insert(
        CHARLA.map(([role, lang, content, translated], i) => ({
          conversation_id: conversation.id,
          role,
          lang,
          content,
          translated_text: translated,
          created_at: new Date(Date.now() + i).toISOString(),
        }))
      )
      if (msgError) throw msgError

      const started = Date.now()
      const tips = await extractConversationTips(db, conversation)
      console.log(`\n${tips.length} recomendaciones en ${Date.now() - started} ms:`)
      for (const t of tips) {
        console.log(
          `- ${t.place_name_raw} → ${t.place ? `${t.place.name} (${t.place.id}, ${t.place.walkMinutes} min a pie)` : "sin anclar"}\n` +
            `  qué: ${t.what} | por qué: ${t.why ?? "-"} | cuándo: ${t.when_to_go ?? "-"} | precio: ${t.price_hint ?? "-"}\n` +
            `  quién: ${t.recommender ?? "-"} | confianza: ${t.confidence} | cita: "${t.original_quote ?? "-"}"`
        )
      }

      const names = tips.map((t) => t.place_name_raw.toLowerCase())
      expect(names.some((n) => n.includes("breizh"))).toBe(true)
      expect(names.some((n) => n.includes("enfants rouges"))).toBe(true)
      expect(names.some((n) => n.includes("louvre"))).toBe(false)
      expect(tips).toHaveLength(2)
      expect(tips.every((t) => t.place !== null)).toBe(true)
      expect(tips.find((t) => t.place_name_raw.toLowerCase().includes("breizh"))?.recommender).toMatch(/camille/i)

      // Sumar la de Breizh al plan, como la card de B-5.
      const breizh = tips.find((t) => t.place_name_raw.toLowerCase().includes("breizh"))!
      const added = await addTipToPlan(db, breizh.id, new Date(Date.now() + 3_600_000).toISOString(), "user")
      console.log(`\nAl plan: ${added.ok ? `${added.data.title} (source ${added.data.source}) — ${added.data.notes}` : added.error}`)
      expect(added.ok && added.data.source).toBe("local_tip")
      const { data: status } = await db.from("local_tips").select("status").eq("id", breizh.id).single()
      expect(status?.status).toBe("in_plan")
      if (added.ok) await removeItineraryItem(db, added.data.id, "user")
    } finally {
      // Los mensajes se borran en cascada con la conversación; local_tips no (on delete set null), por eso a mano.
      await db.from("local_tips").delete().eq("conversation_id", conversation.id)
      await db.from("conversations").delete().eq("id", conversation.id)
    }
  }, 60_000)
})
