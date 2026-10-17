import "server-only"

import { getTravelerContext, nextCommitment, type TravelerContext } from "@/lib/data/session"
import type { LatLng } from "@/lib/geo"
import { getWeatherSummary } from "@/lib/weather"

import { buildInstructions } from "./instructions"

/**
 * Contexto + instrucciones del viajero, igual al abrir la sesión que al refrescarla
 * con `session.update` (un solo camino: si cambia una, cambian las dos).
 */
export async function buildSessionInstructions(location: LatLng | null): Promise<{ ctx: TravelerContext; instructions: string }> {
  const ctx = await getTravelerContext({ location })
  const now = new Date()
  const weather = await getWeatherSummary(ctx.location)
  const instructions = buildInstructions({
    ctx,
    nextCommitment: nextCommitment(ctx.itinerary, now),
    weather,
    now,
    timeZone: ctx.timeZone,
  })
  return { ctx, instructions }
}
