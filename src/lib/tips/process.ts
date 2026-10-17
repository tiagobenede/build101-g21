import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { PlaceCard } from "@/hooks/voice-session-types"
import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo"
import { localeAt } from "@/lib/location/locale"
import { searchPlaces } from "@/lib/places/search"

import { extractTips } from "./extract"
import { hasLocalSpeech, type ExtractedTip, type TranslationMessage } from "./transcript"

/**
 * C-5: al cerrar una charla traducida, lo que recomendó el residente queda en
 * `local_tips`, anclado a un lugar real de Google cuando se encuentra.
 */

/** Un residente recomienda cosas de su barrio o de la ciudad; más lejos es otro lugar con el mismo nombre. */
const ANCHOR_MAX_METERS = 5_000

export type LocalTip = {
  id: string
  place_id: string | null
  place_name_raw: string
  what: string
  why: string | null
  when_to_go: string | null
  price_hint: string | null
  recommender: string | null
  original_quote: string | null
  original_lang: string | null
  translated_quote: string | null
  status: "pending" | "saved" | "in_plan" | "dismissed"
  confidence: number | null
  /** El lugar anclado, con la forma de las tarjetas de `/talk`; null si no se encontró. */
  place: PlaceCard | null
}

export type TranslationConversation = {
  id: string
  user_id: string
  trip_id: string | null
  lat: number | null
  lng: number | null
  /** "es-fr": idioma del viajero y del residente. */
  lang_pair: string | null
}

const TIP_COLUMNS =
  "id, place_id, place_name_raw, what, why, when_to_go, price_hint, recommender, original_quote, original_lang, translated_quote, status, confidence"

/** Busca el lugar en Google cerca de donde fue la charla (Text Search tolera nombres mal escritos). */
async function anchor(tip: ExtractedTip, where: LatLng, city: string): Promise<PlaceCard | null> {
  const found = await searchPlaces(tip.place_name, null, where, city).catch((err: unknown) => {
    console.error("[tips] anchor", tip.place_name, err instanceof Error ? err.message : err)
    return null
  })
  const match = found?.find((f) => distanceMeters(where, f) <= ANCHOR_MAX_METERS)
  if (!match) return null
  return {
    id: match.id,
    name: match.name,
    category: match.category,
    description: match.description,
    walkMinutes: walkMinutes(where, match),
    stayMinutes: match.typical_visit_minutes,
  }
}

/** Dónde fue la charla: la ubicación guardada al empezar, o el centro del viaje. */
async function whereItHappened(db: SupabaseClient, conversation: TranslationConversation): Promise<LatLng | null> {
  if (conversation.lat !== null && conversation.lng !== null) return { lat: conversation.lat, lng: conversation.lng }
  if (!conversation.trip_id) return null
  const { data } = await db.from("trips").select("lat, lng").eq("id", conversation.trip_id).maybeSingle()
  return data ? { lat: data.lat as number, lng: data.lng as number } : null
}

/** Extrae, ancla y guarda las recomendaciones de una charla. Devuelve las nuevas filas. */
export async function extractConversationTips(db: SupabaseClient, conversation: TranslationConversation): Promise<LocalTip[]> {
  const { data: messages, error } = await db
    .from("messages")
    .select("role, content, translated_text, lang")
    .eq("conversation_id", conversation.id)
    .order("created_at")
  if (error) throw new Error(`No se pudo leer la charla: ${error.message}`)
  if (!hasLocalSpeech(messages as TranslationMessage[])) return []

  const tips = await extractTips(messages as TranslationMessage[])
  if (tips.length === 0) return []

  const where = await whereItHappened(db, conversation)
  const city = where ? ((await localeAt(where)).city ?? "") : ""
  const places = await Promise.all(tips.map((t) => (where ? anchor(t, where, city) : Promise.resolve(null))))
  const residentLang = conversation.lang_pair?.split("-")[1] ?? null

  const { data: rows, error: insertError } = await db
    .from("local_tips")
    .insert(
      tips.map((t, i) => ({
        user_id: conversation.user_id,
        trip_id: conversation.trip_id,
        conversation_id: conversation.id,
        place_id: places[i]?.id ?? null,
        place_name_raw: t.place_name,
        what: t.what,
        why: t.why,
        when_to_go: t.when_to_go,
        price_hint: t.price_hint,
        recommender: t.recommender,
        original_quote: t.original_quote,
        original_lang: residentLang,
        translated_quote: t.translated_quote,
        confidence: t.confidence,
      }))
    )
    .select(TIP_COLUMNS)
  if (insertError) throw new Error(`No se pudieron guardar las recomendaciones: ${insertError.message}`)

  // `insert` devuelve las filas en el mismo orden.
  return (rows as Omit<LocalTip, "place">[]).map((row, i) => ({ ...row, place: places[i] }))
}
