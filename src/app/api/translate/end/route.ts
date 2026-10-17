import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const bodySchema = z.object({ conversationId: z.uuid() })

/**
 * Cierra la conversación de traducción. Las recomendaciones del residente (C-5) ya se
 * extrajeron turno a turno en `/api/translate/tips`.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase
    .from("conversations")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", parsed.data.conversationId)
    .is("ended_at", null)
  if (error) {
    console.error("[translate] end conversation failed", error.message)
    return NextResponse.json({ success: false, error: "No se pudo cerrar." }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
