import { z } from "zod"

import { speakPhrase } from "@/lib/audio/tts"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const MAX_PER_MINUTE = 20

const bodySchema = z.object({
  text: z.string().trim().min(1).max(300),
  lang: z.string().min(2).max(20),
})

/** Audio (MP3) de una frase para decirle a alguien del lugar. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Iniciá sesión." }, { status: 401 })
  if (!allowRequest(`tts:${user.id}`, MAX_PER_MINUTE)) return Response.json({ error: "Demasiados pedidos seguidos." }, { status: 429 })

  const audio = await speakPhrase(parsed.data.text, parsed.data.lang)
  if (!audio) return Response.json({ error: "No pude generar el audio." }, { status: 502 })
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } })
}
