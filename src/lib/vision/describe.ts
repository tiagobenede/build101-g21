import "server-only"

import { z } from "zod"

import type { LatLng } from "@/lib/geo"
import { callStructured } from "@/lib/llm/structured"

import type { Photo } from "./jev"

/**
 * Respaldo cuando Jev no reconoce ninguno de los lugares cercanos: un LLM con visión
 * mira la foto con el contexto de dónde está el viajero, sin opciones, y devuelve solo
 * el nombre. Explicar el lugar o sumarlo al plan lo hace el agente de voz con sus tools
 * (búsqueda web, `search_places`, `edit_itinerary`).
 */

/** gpt-5.6-luna con `reasoning.effort: none` tarda ~2 s (no acepta "minimal"). */
const VISION_MODEL = process.env.VISION_MODEL ?? "gpt-5.6-luna"
const TIMEOUT_MS = 12_000

const answerSchema = z.object({ name: z.string().nullable() })

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: {
      type: ["string", "null"],
      description: "Nombre del lugar, edificio o monumento de la foto, como se busca en un mapa. null si no es un lugar identificable.",
    },
  },
}

/** Nombre del lugar de la foto, o null si no se puede saber. */
export async function namePhotoPlace(photo: Photo, where: { label: string; city: string | null; location: LatLng }): Promise<string | null> {
  const context =
    `El viajero sacó esta foto cerca de ${where.label}` +
    `${where.city ? `, en ${where.city}` : ""} (${where.location.lat.toFixed(5)}, ${where.location.lng.toFixed(5)}). ` +
    "¿Qué lugar es? Respondé solo el nombre. Si no estás seguro o no es un lugar, null."

  const answer = await callStructured({
    model: VISION_MODEL,
    effort: "none",
    maxOutputTokens: 60,
    timeoutMs: TIMEOUT_MS,
    content: [
      { type: "input_text", text: context },
      { type: "input_image", image_url: `data:${photo.mime};base64,${Buffer.from(photo.bytes).toString("base64")}`, detail: "low" },
    ],
    schemaName: "lugar",
    schema: JSON_SCHEMA,
  })
  return answerSchema.parse(answer).name?.trim() || null
}
