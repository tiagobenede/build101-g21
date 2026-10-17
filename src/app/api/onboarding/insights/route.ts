import { z } from "zod"

import { extractInsights } from "@/lib/onboarding/extract"
import { transcriptSchema } from "@/lib/onboarding/schema"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const bodySchema = z.object({ transcript: transcriptSchema })
const MAX_PER_MINUTE = 5

/** Arma el perfil del onboarding (insights con detalle y porqué) con la transcripción de la charla. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Sin sesión." }, { status: 401 })
  if (!allowRequest(`onboarding-insights:${user.id}`, MAX_PER_MINUTE)) {
    return Response.json({ error: "Demasiados pedidos seguidos." }, { status: 429 })
  }

  try {
    return Response.json(await extractInsights(parsed.data.transcript))
  } catch (err) {
    console.error("[onboarding] insights failed", err instanceof Error ? err.message : err)
    return Response.json({ error: "No pude armar tu resumen." }, { status: 502 })
  }
}
