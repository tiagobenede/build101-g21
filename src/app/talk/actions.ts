"use server"

import { z } from "zod"

import { placeNameAt } from "@/lib/location/locale"
import { latLngSchema } from "@/lib/location/schema"
import { createClient } from "@/lib/supabase/server"
import { LANG_CODES, localLanguage, type Lang } from "@/lib/translate/config"

const turnSchema = z.object({
  conversationId: z.uuid(),
  role: z.enum(["user", "agent"]),
  text: z.string().trim().min(1).max(4000),
})

/** Guarda un turno de la llamada (no se muestra en la UI; queda como historial). */
export async function saveTurn(input: { conversationId: string; role: "user" | "agent"; text: string }): Promise<void> {
  const parsed = turnSchema.safeParse(input)
  if (!parsed.success) return
  const supabase = await createClient()
  const { error } = await supabase.from("messages").insert({
    conversation_id: parsed.data.conversationId,
    role: parsed.data.role,
    content: parsed.data.text,
  })
  if (error) console.error("[talk] saveTurn failed", error.message)
}

/**
 * Idioma de la gente del lugar donde está el viajero ahora (para el traductor). Con la
 * ubicación en vivo: la que se calculó al cargar la página puede ser de antes de moverse.
 */
export async function localLanguageAt(input: { lat: number; lng: number }, myLang: Lang): Promise<Lang | null> {
  const parsed = latLngSchema.safeParse(input)
  if (!parsed.success || !LANG_CODES.includes(myLang)) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const place = await placeNameAt(parsed.data)
  return place ? localLanguage(place.countryCode, myLang) : null
}
