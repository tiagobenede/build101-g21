import { NextResponse } from "next/server"
import { z } from "zod"

import type { PlaceCard } from "@/hooks/voice-session-types"
import { walkMinutes } from "@/lib/geo"
import { placeNameAt } from "@/lib/location/locale"
import { latLngSchema } from "@/lib/location/schema"
import { findPlaceByName } from "@/lib/places/lookup"
import { searchPlaces } from "@/lib/places/search"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const MAX_PER_MINUTE = 10

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: latLngSchema,
})

type ResolveResponse = { success: true; data: { place: PlaceCard | null } } | { success: false; error: string }

/**
 * Un nombre de lugar ("Place des Vosges", de la foto) → el lugar de `places` para
 * mostrarlo y sumarlo al plan. Primero lo guardado cerca; si no está, Google (y queda guardado).
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json<ResolveResponse>({ success: false, error: "Pedido inválido." }, { status: 400 })
  const { name, location } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json<ResolveResponse>({ success: false, error: "Iniciá sesión." }, { status: 401 })
  if (!allowRequest(`resolve:${user.id}`, MAX_PER_MINUTE)) {
    return NextResponse.json<ResolveResponse>({ success: false, error: "Demasiados pedidos seguidos." }, { status: 429 })
  }

  const known = await findPlaceByName(supabase, name, location, { exact: true })
  const place =
    known ??
    (await placeNameAt(location)
      .then((here) => searchPlaces(name, null, location, here?.city ?? ""))
      .then((found) => found[0] ?? null)
      .catch((err: unknown) => {
        console.error("[places] resolve failed", err instanceof Error ? err.message : err)
        return null
      }))

  return NextResponse.json<ResolveResponse>({
    success: true,
    data: {
      place: place && {
        id: place.id,
        name: place.name,
        category: place.category,
        description: place.description,
        walkMinutes: walkMinutes(location, place),
        stayMinutes: place.typical_visit_minutes,
      },
    },
  })
}
