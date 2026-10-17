import "server-only"

import { z } from "zod"

import type { LatLng } from "@/lib/geo"

import type { Photo } from "./jev"

/**
 * Respaldo cuando Jev no reconoce ninguno de los lugares cercanos: un LLM con visión
 * mira la foto con el contexto de dónde está el viajero, sin opciones, y devuelve solo
 * el nombre. Explicar el lugar o sumarlo al plan lo hace el agente de voz con sus tools
 * (búsqueda web, `search_places`, `edit_itinerary`).
 */

const RESPONSES_URL = "https://api.openai.com/v1/responses"
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
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY.")

  const context =
    `El viajero sacó esta foto cerca de ${where.label}` +
    `${where.city ? `, en ${where.city}` : ""} (${where.location.lat.toFixed(5)}, ${where.location.lng.toFixed(5)}). ` +
    "¿Qué lugar es? Respondé solo el nombre. Si no estás seguro o no es un lugar, null."

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      reasoning: { effort: "none" },
      max_output_tokens: 60,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: context },
            {
              type: "input_image",
              image_url: `data:${photo.mime};base64,${Buffer.from(photo.bytes).toString("base64")}`,
              detail: "low",
            },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "lugar", strict: true, schema: JSON_SCHEMA } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const body = (await res.json()) as { output?: { content?: { type: string; text?: string }[] }[] }
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text
  if (!text) throw new Error("OpenAI no devolvió texto.")
  return answerSchema.parse(JSON.parse(text)).name?.trim() || null
}
