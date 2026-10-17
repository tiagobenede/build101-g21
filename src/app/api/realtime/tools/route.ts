import { NextResponse } from "next/server"
import { z } from "zod"

import { runTool } from "@/lib/agent/run-tool"
import { latLngSchema } from "@/lib/location/schema"
import type { ToolResult } from "@/lib/realtime/tools"

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  arguments: z.string().max(4000),
  conversationId: z.uuid(),
  /** Ubicación en vivo (joystick o GPS) al momento de la llamada al tool. */
  location: latLngSchema.nullable().default(null),
})

/**
 * Ejecuta una llamada a tool del agente de voz. Es un route handler y no una
 * server action porque Next despacha las server actions de a una por cliente:
 * un tool lento bloquearía a los demás y a `saveTurn` mientras seguimos hablando.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })

  const { name, arguments: args, conversationId, location } = parsed.data
  const result = await runTool(name, args, conversationId, location)
  return NextResponse.json<ToolResult>(result)
}
