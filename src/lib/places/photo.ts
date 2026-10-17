import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

const PLACES_URL = "https://places.googleapis.com/v1"
const TIMEOUT_MS = 5_000
const MAX_WIDTH_PX = 800
/** La URL de la foto que da Google dura un rato; la volvemos a pedir después de esto. */
const URI_CACHE_MS = 60 * 60 * 1000

type PhotoPlace = { id: string; name: string; lat: number; lng: number; data: Record<string, unknown> | null }
type PhotosResponse = { photos?: { name?: string }[] }

const uriCache = new Map<string, { at: number; uri: string | null }>()

async function google<T>(path: string, init: RequestInit & { fieldMask: string }): Promise<T> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error("Falta GOOGLE_API_KEY.")
  const res = await fetch(`${PLACES_URL}/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": init.fieldMask },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Google ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

/**
 * Nombre de la foto principal en Google ("places/…/photos/…"). Los lugares de Google van
 * por id; los nuestros, por nombre cerca de donde están. Queda guardado en `places.data.photo`
 * (string vacío = no tiene), así se busca una sola vez por lugar.
 */
async function photoName(place: PhotoPlace): Promise<string | null> {
  const saved = place.data?.photo
  if (typeof saved === "string") return saved || null

  const googleId = place.data?.google_place_id
  const first =
    typeof googleId === "string"
      ? (await google<PhotosResponse>(`places/${encodeURIComponent(googleId)}`, { fieldMask: "photos" })).photos?.[0]
      : (
          await google<{ places?: PhotosResponse[] }>("places:searchText", {
            method: "POST",
            fieldMask: "places.photos",
            body: JSON.stringify({
              textQuery: place.name,
              maxResultCount: 1,
              locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 300 } },
            }),
          })
        ).places?.[0]?.photos?.[0]
  const name = first?.name ?? null

  await createAdminClient()
    .from("places")
    .update({ data: { ...place.data, photo: name ?? "" } })
    .eq("id", place.id)
  return name
}

/** URL pública de la foto principal del lugar (para un <img>), o null si no tiene o falla. */
export async function getPlacePhotoUri(place: PhotoPlace): Promise<string | null> {
  const hit = uriCache.get(place.id)
  if (hit && Date.now() - hit.at < URI_CACHE_MS) return hit.uri

  try {
    const name = await photoName(place)
    const uri = name
      ? ((
          await google<{ photoUri?: string }>(`${name}/media?maxWidthPx=${MAX_WIDTH_PX}&skipHttpRedirect=true`, {
            fieldMask: "*",
          })
        ).photoUri ?? null)
      : null
    uriCache.set(place.id, { at: Date.now(), uri })
    return uri
  } catch (err) {
    console.error("[places] photo", err instanceof Error ? err.message : err)
    return null
  }
}
