import { NextResponse } from "next/server"
import { z } from "zod"

import { latLngSchema } from "@/lib/location/schema"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"
import {
  INPUT_TRANSCRIPTION_MODEL,
  LANG_CODES,
  TRANSLATE_KEY_TTL_SECONDS,
  TRANSLATE_MODEL,
} from "@/lib/translate/config"

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/translations/client_secrets"
/** Cada vez que alguien aprieta "hablo yo" o "habla él/ella" se abre una sesión. */
const MAX_PER_MINUTE = 20

const bodySchema = z.object({
  targetLang: z.enum(LANG_CODES),
  myLang: z.enum(LANG_CODES),
  theirLang: z.enum(LANG_CODES),
  /** null en la primera sesión: se crea la conversación. */
  conversationId: z.uuid().nullable(),
  location: latLngSchema.nullable().default(null),
})

type SessionResponse =
  | { success: true; data: { key: string; conversationId: string } }
  | { success: false; error: string }

const fail = (status: number, error: string) => NextResponse.json<SessionResponse>({ success: false, error }, { status })

/**
 * Key efímera para una sesión de traducción (una dirección: lo que entra se traduce a
 * `targetLang`). La primera vez crea la conversación `kind = 'translation'`.
 */
export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fail(500, "Falta OPENAI_API_KEY en .env.local.")

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail(400, "Pedido inválido.")
  const { targetLang, myLang, theirLang, location } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail(401, "Iniciá sesión.")
  if (!allowRequest(`translate:${user.id}`, MAX_PER_MINUTE)) return fail(429, "Demasiadas sesiones seguidas. Esperá un minuto.")

  let conversationId = parsed.data.conversationId
  if (!conversationId) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: trip } = await supabase
      .from("trips")
      .select("id")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        trip_id: trip?.id ?? null,
        kind: "translation",
        lang_pair: `${myLang}-${theirLang}`,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      })
      .select("id")
      .single()
    if (error) {
      console.error("[translate] insert conversation failed", error.message)
      return fail(500, "No se pudo iniciar la traducción.")
    }
    conversationId = conversation.id as string
  }

  const res = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: TRANSLATE_KEY_TTL_SECONDS },
      session: {
        model: TRANSLATE_MODEL,
        audio: {
          // La transcripción del original es lo que se guarda como "lo que dijo".
          input: { transcription: { model: INPUT_TRANSCRIPTION_MODEL }, noise_reduction: { type: "near_field" } },
          output: { language: targetLang },
        },
      },
    }),
  })
  const body: unknown = await res.json().catch(() => null)
  const key = (body as { value?: unknown } | null)?.value
  if (!res.ok || typeof key !== "string") {
    console.error("[translate] client_secrets failed", res.status, JSON.stringify(body)?.slice(0, 500))
    return fail(502, "OpenAI no abrió la traducción.")
  }

  return NextResponse.json<SessionResponse>({ success: true, data: { key, conversationId } })
}
