import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { extractConversationTips, type LocalTip, type TranslationConversation } from "@/lib/tips/process"

const bodySchema = z.object({ conversationId: z.uuid() })

type EndResponse = { success: true; data: { tips: LocalTip[] } } | { success: false; error: string }

/**
 * Cierra la conversación de traducción y extrae lo que recomendó el residente (C-5).
 * Devuelve las recomendaciones nuevas para mostrarlas como cards (B-5). Si el cierre
 * llega dos veces (botón y `sendBeacon` al salir), solo la primera extrae.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json<EndResponse>({ success: false, error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const { data: closed, error } = await supabase
    .from("conversations")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", parsed.data.conversationId)
    .eq("kind", "translation")
    .is("ended_at", null)
    .select("id, user_id, trip_id, lat, lng, lang_pair")
    .maybeSingle()
  if (error) {
    console.error("[translate] end conversation failed", error.message)
    return NextResponse.json<EndResponse>({ success: false, error: "No se pudo cerrar." }, { status: 500 })
  }
  if (!closed) return NextResponse.json<EndResponse>({ success: true, data: { tips: [] } })

  // Si la extracción falla, la charla igual quedó cerrada y guardada.
  const tips = await extractConversationTips(supabase, closed as TranslationConversation).catch((err: unknown) => {
    console.error("[tips] extract failed", err instanceof Error ? err.message : err)
    return []
  })
  return NextResponse.json<EndResponse>({ success: true, data: { tips } })
}
