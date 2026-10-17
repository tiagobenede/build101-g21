import { NextResponse } from "next/server"
import { z } from "zod"

import { latLngSchema } from "@/lib/location/schema"
import { buildSessionInstructions } from "@/lib/realtime/session-context"

const bodySchema = z.object({ location: latLngSchema.nullable().default(null) })

/**
 * Instrucciones nuevas para una llamada abierta (`session.update`): mismas que al
 * abrir la sesión, con la ubicación en vivo y el itinerario de ahora.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  const { instructions } = await buildSessionInstructions(parsed.success ? parsed.data.location : null)
  return NextResponse.json({ instructions })
}
