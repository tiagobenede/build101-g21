/**
 * Lo que recomienda la persona local durante la traducción → `local_tips` (el corazón
 * de C-5, pero por turno y en vivo, para mostrarlo en pantalla mientras se habla).
 * Lo puro (esquema, prompt, parseo) se testea solo; el modelo se llama desde la ruta.
 */
import { z } from "zod"

import type { Speaker } from "./config"

export const MAX_TIPS_PER_TURN = 3

export const tipsSchema = z.object({
  tips: z
    .array(
      z.object({
        place_name: z.string().describe("Nombre del lugar como lo dijo, en su idioma original (ej. 'Marché des Enfants Rouges')."),
        search_query: z.string().describe("Cómo buscarlo en Google Maps: nombre + barrio o ciudad si se dijo."),
        what: z.string().describe("Qué recomienda, en español rioplatense, corto: 'Comer el cuscús del mercado'."),
        why: z.string().nullable().describe("Por qué, si lo dijo."),
        when_to_go: z.string().nullable().describe("Cuándo ir, si lo dijo."),
        price_hint: z.string().nullable().describe("Precio, si lo dijo."),
        recommender: z.string().nullable().describe("Quién lo recomienda, si se presentó ('Camille, la de la panadería')."),
        original_quote: z.string().describe("La frase original donde lo recomienda."),
        translated_quote: z.string().describe("Esa frase traducida."),
        confidence: z.number().describe("0 a 1: qué tan seguro es que recomienda un lugar concreto."),
      })
    )
    .describe("Vacío si en el último turno no recomienda ningún lugar concreto."),
})
export type ExtractedTip = z.infer<typeof tipsSchema>["tips"][number]

/** Esquema para `response_format` de la API de chat (estricto: todo requerido). */
export function tipsJsonSchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(tipsSchema) }
  delete schema.$schema
  return schema
}

export type Turn = { speaker: Speaker; original: string; translated: string }

export const TIPS_SYSTEM_PROMPT = `Sos parte de Rumbo, un guía de viaje. Un viajero habla con una persona local a través de un traductor.
Te paso los últimos turnos. Extraé SOLO los lugares concretos (un restaurante, un mercado, un bar, un museo, una calle, un barrio) que la persona local recomienda en su ÚLTIMO turno. Usá los turnos anteriores para entender a qué responde ("¿dónde como?" → lo que nombra es para comer).
Nada de lugares que solo menciona sin recomendar, ni de recomendaciones genéricas ("andá a un café"). Si no hay, devolvé tips vacío.`

const label = (s: Speaker) => (s === "me" ? "Viajero" : "Local")

/** Mensaje del usuario para el modelo: los turnos con original y traducción. */
export function buildTipsPrompt(turns: Turn[], city: string): string {
  const lines = turns.map((t) => `${label(t.speaker)}: ${t.original || t.translated}${t.original && t.translated ? ` (traducido: ${t.translated})` : ""}`)
  return `Ciudad: ${city}\n\n${lines.join("\n")}`
}

/** Las que valen la pena: con nombre y confianza razonable, hasta 3. */
export function keepTips(tips: ExtractedTip[]): ExtractedTip[] {
  return tips.filter((t) => t.place_name.trim().length >= 2 && t.confidence >= 0.5).slice(0, MAX_TIPS_PER_TURN)
}
