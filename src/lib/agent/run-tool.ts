import "server-only"

import { rankPlaces, resolveAvailableMinutes } from "@/lib/agent/rank"
import { getTravelerContext, nextCommitment } from "@/lib/data/session"
import { isToolName, toolSchemas, type ToolArgs, type ToolResult } from "@/lib/realtime/tools"
import { createClient } from "@/lib/supabase/server"

const fail = (error: string): ToolResult => ({ output: JSON.stringify({ error }), cards: [] })

async function recommendNearby(args: ToolArgs<"recommend_nearby">, conversationId: string): Promise<ToolResult> {
  const ctx = await getTravelerContext()
  const supabase = await createClient()

  const { data: previous, error } = await supabase
    .from("recommendations")
    .select("place_id")
    .eq("conversation_id", conversationId)
  if (error) return fail("No pude leer la conversación.")

  const now = new Date()
  const commitment = nextCommitment(ctx.itinerary, now)
  const availableMinutes = resolveAvailableMinutes(
    args.available_minutes,
    commitment ? new Date(commitment.starts_at) : null,
    now
  )
  const ranked = rankPlaces({
    places: ctx.nearby,
    interests: ctx.interests,
    requestedTag: args.interest,
    availableMinutes,
    alreadyRecommended: previous.map((r) => r.place_id as string),
  })

  if (ranked.length > 0) {
    const { error: insertError } = await supabase.from("recommendations").insert(
      ranked.map((r) => ({
        conversation_id: conversationId,
        user_id: ctx.userId,
        place_id: r.place.id,
        walk_minutes: r.walkMinutes,
      }))
    )
    if (insertError) console.error("[tools] insert recommendations failed", insertError.message)
  }

  return {
    output: JSON.stringify({
      available_minutes: availableMinutes,
      next_commitment: commitment?.title ?? null,
      places: ranked.map((r) => ({
        name: r.place.name,
        category: r.place.category,
        walk_min: r.walkMinutes,
        stay_min: r.stayMinutes,
        matches: r.matchedTags,
      })),
    }),
    cards: ranked.map((r) => ({
      id: r.place.id,
      name: r.place.name,
      category: r.place.category,
      description: r.place.description,
      walkMinutes: r.walkMinutes,
      stayMinutes: r.stayMinutes,
    })),
  }
}

/** Ejecuta un tool del agente con los permisos del usuario logueado. */
export async function runTool(name: string, rawArgs: string, conversationId: string): Promise<ToolResult> {
  if (!isToolName(name)) return fail(`Tool desconocido: ${name}.`)

  let json: unknown
  try {
    json = JSON.parse(rawArgs || "{}")
  } catch {
    return fail("Argumentos inválidos.")
  }
  const parsed = toolSchemas[name].safeParse(json)
  if (!parsed.success) return fail("Argumentos inválidos.")

  switch (name) {
    case "recommend_nearby":
      return recommendNearby(parsed.data, conversationId)
  }
}
