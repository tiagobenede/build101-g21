import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { summarizeTranslation } from "@/lib/translate/server"

const bodySchema = z.object({ conversationId: z.uuid() })

/**
 * Cierra la conversación de traducción y la resume (para el agente, si se lo llama al
 * rato). Las recomendaciones del residente (C-5) ya se extrajeron turno a turno en
 * `/api/translate/tips`.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido inválido." }, { status: 400 })
  const { conversationId } = parsed.data

  const supabase = await createClient()
  const { data: closed, error } = await supabase
    .from("conversations")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", conversationId)
    .is("ended_at", null)
    .select("id")
  if (error) {
    console.error("[translate] end conversation failed", error.message)
    return NextResponse.json({ success: false, error: "No se pudo cerrar." }, { status: 500 })
  }

  // Solo quien la cerró resume (el traductor puede avisar dos veces: al salir y al cerrar la pestaña).
  if (closed.length > 0 && process.env.OPENAI_API_KEY) {
    await summarizeTranslation(supabase, conversationId).catch((err: unknown) =>
      console.error("[translate] summary failed", err instanceof Error ? err.message : err)
    )
  }
  return NextResponse.json({ success: true })
}
