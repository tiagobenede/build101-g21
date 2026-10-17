import "server-only"

import { z } from "zod"

import type { LatLng } from "@/lib/geo"

import type { Photo } from "./jev"

/**
 * Respaldo cuando Jev no reconoce ninguno de los lugares cercanos: un LLM con visión
 * mira la foto con el contexto de dónde está el viajero, sin opciones.
 */

const RESPONSES_URL = "https://api.openai.com/v1/responses"
/** gpt-5.6-luna con `reasoning.effort: none` tarda ~2 s (no acepta "minimal"). */
const VISION_MODEL = process.env.VISION_MODEL ?? "gpt-5.6-luna"
const TIMEOUT_MS = 12_000

const descriptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  searchable: z.boolean(),
})

export type PhotoDescription = z.infer<typeof descriptionSchema>

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "searchable"],
  properties: {
    name: { type: "string", description: "Nombre de lo que se ve (el lugar, edificio u objeto). Vacío si no se puede saber." },
    description: { type: "string", description: "Una o dos frases en español, para decir en voz alta." },
    searchable: { type: "boolean", description: "true si es un lugar concreto que se puede buscar en un mapa por su nombre." },
  },
}

export async function describePhoto(photo: Photo, where: { label: string; city: string | null; location: LatLng }): Promise<PhotoDescription> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY.")

  const context =
    `El viajero sacó esta foto cerca de ${where.label}` +
    `${where.city ? `, en ${where.city}` : ""} (${where.location.lat.toFixed(5)}, ${where.location.lng.toFixed(5)}). ` +
    "¿Qué se ve? Si es un lugar conocido, nombralo. No inventes: si no estás seguro, decilo en la descripción."

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      reasoning: { effort: "none" },
      max_output_tokens: 300,
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
      text: { format: { type: "json_schema", name: "foto", strict: true, schema: JSON_SCHEMA } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const body = (await res.json()) as { output?: { content?: { type: string; text?: string }[] }[] }
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text
  if (!text) throw new Error("OpenAI no devolvió texto.")
  return descriptionSchema.parse(JSON.parse(text))
}
