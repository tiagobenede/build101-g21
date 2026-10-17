import { z } from "zod"

import { extractKeywords } from "@/lib/onboarding/extract"
import { LAST_QUESTION } from "@/lib/onboarding/questions"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const bodySchema = z.object({
  question: z.number().int().min(1).max(LAST_QUESTION),
  text: z.string().trim().min(1).max(600),
})
const MAX_PER_MINUTE = 40

/** Palabras clave de una respuesta del onboarding (las burbujas). */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Sin sesión." }, { status: 401 })
  if (!allowRequest(`onboarding-keywords:${user.id}`, MAX_PER_MINUTE)) {
    return Response.json({ error: "Demasiados pedidos seguidos." }, { status: 429 })
  }

  try {
    return Response.json({ keywords: await extractKeywords(parsed.data.question, parsed.data.text) })
  } catch (err) {
    console.error("[onboarding] keywords failed", err instanceof Error ? err.message : err)
    return Response.json({ keywords: [] })
  }
}
