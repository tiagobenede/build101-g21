"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const turnSchema = z.object({
  conversationId: z.uuid(),
  role: z.enum(["user", "agent"]),
  text: z.string().trim().min(1).max(4000),
})

/** Guarda un turno de la llamada (no se muestra en la UI; queda como historial). */
export async function saveTurn(input: { conversationId: string; role: "user" | "agent"; text: string }): Promise<void> {
  const parsed = turnSchema.safeParse(input)
  if (!parsed.success) return
  const supabase = await createClient()
  const { error } = await supabase.from("messages").insert({
    conversation_id: parsed.data.conversationId,
    role: parsed.data.role,
    content: parsed.data.text,
  })
  if (error) console.error("[talk] saveTurn failed", error.message)
}
