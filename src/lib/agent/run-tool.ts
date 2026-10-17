import "server-only"

import { rankPlaces, resolveAvailableMinutes } from "@/lib/agent/rank"
import { getTravelerContext, nextCommitment } from "@/lib/data/session"
import type { LatLng } from "@/lib/geo"
import { searchPlaces } from "@/lib/places/search"
import { isToolName, toolSchemas, type ToolArgs, type ToolResult } from "@/lib/realtime/tools"
import { createClient } from "@/lib/supabase/server"

const fail = (error: string): ToolResult => ({ output: JSON.stringify({ error }), cards: [] })

async function recommendNearby(
  args: ToolArgs<"recommend_nearby">,
  conversationId: string,
  location: LatLng | null
): Promise<ToolResult> {
  const ctx = await getTravelerContext({ location })
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

const SUMMARY_MAX_CHARS = 90

async function searchPlacesTool(args: ToolArgs<"search_places">, location: LatLng | null): Promise<ToolResult> {
  const ctx = await getTravelerContext({ location })
  const found = await searchPlaces(args.query, args.open_now, ctx.location, ctx.trip?.destination ?? "París").catch(
    (err: unknown) => {
      console.error("[tools] search_places failed", err instanceof Error ? err.message : err)
      return null
    }
  )
  if (!found) return fail("No pude buscar en Google ahora.")

  return {
    output: JSON.stringify({
      places: found.map((p) => ({
        name: p.name,
        category: p.category,
        walk_min: p.walkMinutes,
        open_now: p.openNow,
        rating: p.rating,
        summary: p.description?.slice(0, SUMMARY_MAX_CHARS) ?? null,
      })),
    }),
    cards: found.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      walkMinutes: p.walkMinutes,
      stayMinutes: p.typical_visit_minutes,
    })),
  }
}

/** Ejecuta un tool del agente con los permisos del usuario logueado. */
export async function runTool(
  name: string,
  rawArgs: string,
  conversationId: string,
  location: LatLng | null = null
): Promise<ToolResult> {
  if (!isToolName(name)) return fail(`Tool desconocido: ${name}.`)

  let json: unknown
  try {
    json = JSON.parse(rawArgs || "{}")
  } catch {
    return fail("Argumentos inválidos.")
  }
  const invalid = fail("Argumentos inválidos.")

  switch (name) {
    case "recommend_nearby": {
      const args = toolSchemas.recommend_nearby.safeParse(json)
      return args.success ? recommendNearby(args.data, conversationId, location) : invalid
    }
    case "search_places": {
      const args = toolSchemas.search_places.safeParse(json)
      return args.success ? searchPlacesTool(args.data, location) : invalid
    }
  }
}
