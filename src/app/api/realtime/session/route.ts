import { NextResponse } from "next/server"

import { getTravelerContext, nextCommitment, TRIP_TIME_ZONE } from "@/lib/data/session"
import {
  EPHEMERAL_KEY_TTL_SECONDS,
  MAX_OUTPUT_TOKENS,
  REALTIME_MODEL,
  REALTIME_VOICE,
  TURN_DETECTION,
} from "@/lib/realtime/config"
import { buildInstructions } from "@/lib/realtime/instructions"
import { allowSessionMint } from "@/lib/realtime/rate-limit"
import { TOOL_DEFINITIONS } from "@/lib/realtime/tools"
import { createClient } from "@/lib/supabase/server"
import { getWeatherSummary } from "@/lib/weather"

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"

type SessionResponse =
  | { success: true; data: { key: string; model: string; conversationId: string } }
  | { success: false; error: string }

const fail = (status: number, error: string) => NextResponse.json<SessionResponse>({ success: false, error }, { status })

/**
 * Acuña una key efímera de OpenAI Realtime con el contexto del viajero.
 * La API key real nunca llega al navegador.
 */
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fail(500, "Falta OPENAI_API_KEY en .env.local.")

  const ctx = await getTravelerContext()
  if (!allowSessionMint(ctx.userId)) return fail(429, "Demasiadas sesiones seguidas. Esperá un minuto.")

  const now = new Date()
  const weather = await getWeatherSummary(ctx.location)
  const instructions = buildInstructions({
    ctx,
    nextCommitment: nextCommitment(ctx.itinerary, now),
    weather,
    now,
    timeZone: TRIP_TIME_ZONE,
  })

  const res = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: EPHEMERAL_KEY_TTL_SECONDS },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        output_modalities: ["audio"],
        max_output_tokens: MAX_OUTPUT_TOKENS,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        audio: {
          // Conversación full-duplex con VAD; sin transcripción del usuario (cuesta y la UI no la muestra).
          input: { turn_detection: TURN_DETECTION, noise_reduction: { type: "near_field" }, transcription: null },
          output: { voice: REALTIME_VOICE },
        },
      },
    }),
  })

  const body: unknown = await res.json().catch(() => null)
  const key = (body as { value?: unknown } | null)?.value
  if (!res.ok || typeof key !== "string") {
    console.error("[realtime] client_secrets failed", res.status, JSON.stringify(body)?.slice(0, 500))
    return fail(502, "OpenAI no abrió la sesión de voz.")
  }

  const supabase = await createClient()
  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({ user_id: ctx.userId, trip_id: ctx.trip?.id ?? null, lat: ctx.location.lat, lng: ctx.location.lng })
    .select("id")
    .single()
  if (error) {
    console.error("[realtime] insert conversation failed", error.message)
    return fail(500, "No se pudo iniciar la conversación.")
  }

  return NextResponse.json<SessionResponse>({
    success: true,
    data: { key, model: REALTIME_MODEL, conversationId: conversation.id },
  })
}
