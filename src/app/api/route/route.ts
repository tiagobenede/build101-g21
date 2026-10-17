import { NextResponse } from "next/server"
import { z } from "zod"

import { latLngSchema } from "@/lib/location/schema"
import { walkingRoute, type WalkingRoute } from "@/lib/maps/walking-route"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const MAX_ROUTES_PER_MINUTE = 30

const bodySchema = z.object({ from: latLngSchema, to: latLngSchema })

/** Ruta a pie para el mapa de "Llevame". `route: null` si Google no la dio (el mapa dibuja la línea recta). */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: "No autorizado." }, { status: 401 })
  if (!allowRequest(`route:${data.user.id}`, MAX_ROUTES_PER_MINUTE))
    return NextResponse.json({ error: "Demasiados pedidos seguidos." }, { status: 429 })

  const route = await walkingRoute(parsed.data.from, parsed.data.to)
  return NextResponse.json<{ route: WalkingRoute | null }>({ route })
}
