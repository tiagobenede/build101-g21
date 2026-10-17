import { NextResponse } from "next/server"

import { EPHEMERAL_KEY_TTL_SECONDS, REALTIME_MODEL, REALTIME_VOICE, TURN_DETECTION } from "@/lib/realtime/config"
import { allowSessionMint } from "@/lib/realtime/rate-limit"
import { buildOnboardingInstructions, onboardingGreeting } from "@/lib/onboarding/instructions"
import { ONBOARDING_TOOL_DEFINITIONS } from "@/lib/onboarding/schema"
import { createClient } from "@/lib/supabase/server"

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
/** Turnos cortos: una reacción y una pregunta. */
const MAX_OUTPUT_TOKENS = 400
/** Transcripción del viajero: de ahí salen las burbujas y el resumen (barata, ~US$0,003/min). */
const TRANSCRIPTION = { model: "gpt-4o-mini-transcribe", language: "es" }

type SessionResponse =
  | { success: true; data: { key: string; model: string; conversationId: string; greeting: string } }
  | { success: false; error: string }

const fail = (status: number, error: string) => NextResponse.json<SessionResponse>({ success: false, error }, { status })

/**
 * Key efímera para el onboarding por voz: otras instrucciones y otros tools (los
 * resuelve el navegador). No usa la ubicación ni los lugares cercanos.
 */
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fail(500, "Falta OPENAI_API_KEY en .env.local.")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail(401, "Sin sesión.")
  if (!allowSessionMint(user.id)) return fail(429, "Demasiadas sesiones seguidas. Esperá un minuto.")

  const { data: profile, error } = await supabase.from("profiles").select("full_name").eq("id", user.id).single()
  if (error) {
    console.error("[onboarding] read profile failed", error.message)
    return fail(500, "No se pudo leer el perfil.")
  }
  const firstName = (profile.full_name as string).split(" ")[0]

  const res = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: EPHEMERAL_KEY_TTL_SECONDS },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: buildOnboardingInstructions(firstName),
        output_modalities: ["audio"],
        max_output_tokens: MAX_OUTPUT_TOKENS,
        tools: ONBOARDING_TOOL_DEFINITIONS,
        tool_choice: "auto",
        audio: {
          // create_response: false → el navegador pide cada respuesta (así puede pasar de pregunta antes).
          input: {
            turn_detection: { ...TURN_DETECTION, create_response: false },
            noise_reduction: { type: "near_field" },
            transcription: TRANSCRIPTION,
          },
          output: { voice: REALTIME_VOICE },
        },
      },
    }),
  })

  const body: unknown = await res.json().catch(() => null)
  const key = (body as { value?: unknown } | null)?.value
  if (!res.ok || typeof key !== "string") {
    console.error("[onboarding] client_secrets failed", res.status, JSON.stringify(body)?.slice(0, 500))
    return fail(502, "OpenAI no abrió la sesión de voz.")
  }

  // Sin fila en `conversations`: el onboarding no guarda turnos ni recomendaciones.
  return NextResponse.json<SessionResponse>({
    success: true,
    data: { key, model: REALTIME_MODEL, conversationId: crypto.randomUUID(), greeting: onboardingGreeting(firstName) },
  })
}
