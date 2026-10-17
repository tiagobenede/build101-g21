"use server"

import { z } from "zod"

import { replyTo } from "@/lib/agent/recommend"
import { getTravelerContext, nextCommitment, TRIP_TIME_ZONE } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"

export type AgentTurn = {
  text: string
  recommendations: { id: string; name: string; category: string; walkMinutes: number; stayMinutes: number }[]
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const messageSchema = z.object({
  conversationId: z.uuid(),
  text: z.string().trim().min(1).max(500),
})

export async function startConversation(): Promise<ActionResult<{ id: string }>> {
  const ctx = await getTravelerContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: ctx.userId, trip_id: ctx.trip?.id ?? null, lat: ctx.location.lat, lng: ctx.location.lng })
    .select("id")
    .single()

  if (error) {
    console.error("[talk] startConversation failed", error.message)
    return { ok: false, error: "No se pudo iniciar la conversación." }
  }
  return { ok: true, data: { id: data.id } }
}

export async function sendMessage(input: { conversationId: string; text: string }): Promise<ActionResult<AgentTurn>> {
  const parsed = messageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Mensaje inválido." }
  const { conversationId, text } = parsed.data

  const ctx = await getTravelerContext()
  const supabase = await createClient()

  const { data: previous, error: prevError } = await supabase
    .from("recommendations")
    .select("place_id")
    .eq("conversation_id", conversationId)
  if (prevError) return { ok: false, error: "No se pudo leer la conversación." }

  const now = new Date()
  const commitment = nextCommitment(ctx.itinerary, now)
  const reply = replyTo(text, {
    firstName: ctx.firstName,
    interests: ctx.interests,
    location: ctx.location,
    locationLabel: ctx.locationLabel,
    places: ctx.nearby,
    nextCommitment: commitment ? { title: commitment.title, startsAt: new Date(commitment.starts_at) } : null,
    now,
    timeZone: TRIP_TIME_ZONE,
    alreadyRecommended: previous.map((r) => r.place_id as string),
  })

  const agentAt = new Date(now.getTime() + 1)
  const { error: msgError } = await supabase.from("messages").insert([
    { conversation_id: conversationId, role: "user", content: text, created_at: now.toISOString() },
    { conversation_id: conversationId, role: "agent", content: reply.text, created_at: agentAt.toISOString() },
  ])
  if (msgError) {
    console.error("[talk] insert messages failed", msgError.message)
    return { ok: false, error: "No se pudo guardar el mensaje." }
  }

  if (reply.recommendations.length > 0) {
    const { error: recError } = await supabase.from("recommendations").insert(
      reply.recommendations.map((r) => ({
        conversation_id: conversationId,
        user_id: ctx.userId,
        place_id: r.place.id,
        walk_minutes: r.walkMinutes,
      }))
    )
    if (recError) console.error("[talk] insert recommendations failed", recError.message)
  }

  return {
    ok: true,
    data: {
      text: reply.text,
      recommendations: reply.recommendations.map((r) => ({
        id: r.place.id,
        name: r.place.name,
        category: r.place.category,
        walkMinutes: r.walkMinutes,
        stayMinutes: r.stayMinutes,
      })),
    },
  }
}

export async function endConversation(conversationId: string): Promise<void> {
  if (!z.uuid().safeParse(conversationId).success) return
  const supabase = await createClient()
  await supabase.from("conversations").update({ ended_at: new Date().toISOString() }).eq("id", conversationId)
}
