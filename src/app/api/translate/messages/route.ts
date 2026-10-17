import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { LANG_CODES } from "@/lib/translate/config"

const bodySchema = z.object({
  conversationId: z.uuid(),
  speaker: z.enum(["me", "them"]),
  /** Idioma en que habló. */
  lang: z.enum(LANG_CODES),
  original: z.string().max(4_000),
  translated: z.string().max(4_000),
})

/**
 * Guarda una frase de la traducción: el viajero es `user` y el residente `local`.
 * `content` es lo que dijo (si no hubo transcripción del original, la traducción).
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido inválido." }, { status: 400 })
  const { conversationId, speaker, lang, original, translated } = parsed.data
  if (!original.trim() && !translated.trim()) return NextResponse.json({ success: true })

  // RLS: solo entra si la conversación es del usuario.
  const supabase = await createClient()
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: speaker === "me" ? "user" : "local",
    lang: original.trim() ? lang : null,
    content: original.trim() || translated.trim(),
    translated_text: translated.trim() || null,
  })
  if (error) {
    console.error("[translate] insert message failed", error.message)
    return NextResponse.json({ success: false, error: "No se pudo guardar." }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
