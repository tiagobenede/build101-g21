import { getPlacePhotoUri } from "@/lib/places/photo"
import { allowRequest } from "@/lib/realtime/rate-limit"
import { createClient } from "@/lib/supabase/server"

const MAX_PER_MINUTE = 60

/** Foto principal de Google de un lugar: redirige a la imagen (la key queda en el server). */
export async function GET(_req: Request, ctx: RouteContext<"/api/places/photo/[id]">) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response(null, { status: 401 })
  if (!allowRequest(`photo:${user.id}`, MAX_PER_MINUTE)) return new Response(null, { status: 429 })

  const { data: place } = await supabase.from("places").select("id, name, lat, lng, data").eq("id", id).maybeSingle()
  const uri = place ? await getPlacePhotoUri(place) : null
  if (!uri) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } })

  return new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "private, max-age=3600" } })
}
