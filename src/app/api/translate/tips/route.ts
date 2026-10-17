import { NextResponse } from "next/server"
import { z } from "zod"

import { walkMinutes } from "@/lib/geo"
import { placeNameAt } from "@/lib/location/locale"
import { latLngSchema } from "@/lib/location/schema"
import { findPlaceByName } from "@/lib/places/lookup"
import { searchPlaces } from "@/lib/places/search"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { LANG_CODES } from "@/lib/translate/config"
import type { LocalTipView } from "@/lib/tips/view"
import { activeTrip } from "@/lib/translate/server"
import {
  buildTipsPrompt,
  keepTips,
  TIPS_SYSTEM_PROMPT,
  tipsJsonSchema,
  tipsSchema,
  type ExtractedTip,
} from "@/lib/translate/tips"

/** Rápido y barato (~US$0,0002 por turno): el mismo que arma la UI generativa. */
const TIPS_MODEL = process.env.TIPS_MODEL ?? "gpt-6-luna"
const TIMEOUT_MS = 8_000
const MAX_TURNS = 4
const MAX_PER_MINUTE = 20

const turnSchema = z.object({
  speaker: z.enum(["me", "them"]),
  original: z.string().max(4_000),
  translated: z.string().max(4_000),
})
const bodySchema = z.object({
  conversationId: z.uuid(),
  /** El último es el turno de la persona local; los anteriores dan contexto. */
  turns: z.array(turnSchema).min(1).max(MAX_TURNS),
  theirLang: z.enum(LANG_CODES),
  location: latLngSchema,
})

/** Lo que vuelve por cada recomendación: lo que muestran las cards del traductor (B-5). */
export type FoundTip = LocalTipView

type TipsResponse = { success: true; data: { tips: FoundTip[] } } | { success: false; error: string }

const fail = (status: number, error: string) => NextResponse.json<TipsResponse>({ success: false, error }, { status })

async function extractTips(userPrompt: string): Promise<ExtractedTip[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TIPS_MODEL,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: TIPS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "local_tips", strict: true, schema: tipsJsonSchema() } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return tipsSchema.parse(JSON.parse(body.choices?.[0]?.message?.content ?? "{}")).tips
}

/**
 * Después de cada turno de la persona local: qué lugares recomendó, anclados a
 * `places` (si no están, se buscan en Google) y guardados en `local_tips`.
 */
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return fail(500, "Falta OPENAI_API_KEY en .env.local.")
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail(400, "Pedido inválido.")
  const { conversationId, turns, theirLang, location } = parsed.data
  const last = turns.at(-1)
  if (last?.speaker !== "them" || !(last.original || last.translated).trim()) {
    return NextResponse.json<TipsResponse>({ success: true, data: { tips: [] } })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail(401, "Iniciá sesión.")
  if (!allowRequest(`tips:${user.id}`, MAX_PER_MINUTE)) return fail(429, "Demasiados pedidos seguidos.")

  // La ciudad es la de donde está ahora (no la del viaje), como en el resto de las búsquedas.
  const [trip, place] = await Promise.all([activeTrip(supabase), placeNameAt(location)])
  const city = place?.city ?? trip?.destination ?? ""

  let extracted: ExtractedTip[]
  try {
    extracted = keepTips(await extractTips(buildTipsPrompt(turns, city)))
  } catch (err) {
    console.error("[translate] tips extraction failed", err instanceof Error ? err.message : err)
    return fail(502, "No pude entender la recomendación.")
  }

  const tips = await Promise.all(
    extracted.map(async (tip) => {
      // Primero lo que ya conocemos; si no, Google (y queda guardado en `places`).
      const known = await findPlaceByName(supabase, tip.place_name, location)
      const place =
        known ??
        (await searchPlaces(tip.search_query, null, location, city)
          .then((found) => found[0] ?? null)
          .catch((err: unknown) => {
            console.error("[translate] tip search failed", err instanceof Error ? err.message : err)
            return null
          }))

      const { data: row, error } = await supabase
        .from("local_tips")
        .insert({
          user_id: user.id,
          trip_id: trip?.id ?? null,
          conversation_id: conversationId,
          place_id: place?.id ?? null,
          place_name_raw: tip.place_name,
          what: tip.what,
          why: tip.why,
          when_to_go: tip.when_to_go,
          price_hint: tip.price_hint,
          recommender: tip.recommender,
          original_quote: tip.original_quote,
          original_lang: theirLang,
          translated_quote: tip.translated_quote,
          confidence: Math.min(1, Math.max(0, tip.confidence)),
          // Guardada por defecto: así avisa al pasar cerca (C-6). La card ofrece descartarla.
          status: "saved",
        })
        .select("id")
        .single()
      if (error) console.error("[translate] insert local tip failed", error.message)

      return {
        id: (row?.id as string | undefined) ?? crypto.randomUUID(),
        placeId: place?.id ?? null,
        placeName: place?.name ?? tip.place_name,
        category: place?.category ?? null,
        what: tip.what,
        why: tip.why,
        whenToGo: tip.when_to_go,
        priceHint: tip.price_hint,
        recommender: tip.recommender,
        originalQuote: tip.original_quote,
        translatedQuote: tip.translated_quote,
        walkMinutes: place ? walkMinutes(location, place) : null,
        stayMinutes: place?.typical_visit_minutes ?? null,
        status: row ? "saved" : "pending",
      } satisfies FoundTip
    })
  )

  return NextResponse.json<TipsResponse>({ success: true, data: { tips } })
}
