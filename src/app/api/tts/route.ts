import { z } from "zod"

import { speakPhrase } from "@/lib/audio/tts"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const MAX_PER_MINUTE = 20
/** El traductor pide una por frase traducida. */
const MAX_TRANSLATION_PER_MINUTE = 60

const bodySchema = z.object({
  text: z.string().trim().min(1).max(300),
  lang: z.string().min(2).max(20),
  kind: z.enum(["phrase", "translation"]).default("phrase"),
})

/** Audio (MP3) de una frase para decirle a alguien del lugar, o de una frase del traductor. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Iniciá sesión." }, { status: 401 })
  const { text, lang, kind } = parsed.data
  const translation = kind === "translation"
  const limit = translation ? MAX_TRANSLATION_PER_MINUTE : MAX_PER_MINUTE
  if (!allowRequest(`tts:${kind}:${user.id}`, limit)) return Response.json({ error: "Demasiados pedidos seguidos." }, { status: 429 })

  const audio = await speakPhrase(text, lang, { fast: translation })
  if (!audio) return Response.json({ error: "No pude generar el audio." }, { status: 502 })
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } })
}
