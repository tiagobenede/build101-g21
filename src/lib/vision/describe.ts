import "server-only"

import { z } from "zod"

import type { LatLng } from "@/lib/geo"
import { callStructured } from "@/lib/llm/structured"
import { VISION } from "@/lib/tuning"

import type { Photo } from "./jev"

/**
 * Un LLM con visión mira la foto con el contexto de dónde está el viajero, sin opciones,
 * y dice qué es: un lugar (edificio, monumento, plaza), una obra (pintura, escultura,
 * vitral) u otra cosa con algo para contar (un plato típico, un objeto de museo).
 * Explicarlo o sumarlo al plan lo hace el agente de voz con sus tools.
 */

/** gpt-5.6-luna con `reasoning.effort: none` tarda ~2 s (no acepta "minimal"). */
const VISION_MODEL = process.env.VISION_MODEL ?? "gpt-5.6-luna"

export const SEEN_KINDS = ["lugar", "obra", "otro"] as const
export type SeenKind = (typeof SEEN_KINDS)[number]

const answerSchema = z.object({
  name: z.string().nullable(),
  kind: z.enum(SEEN_KINDS),
  where: z.string().nullable(),
  about: z.string().nullable(),
})

export type PhotoSubject = {
  name: string
  kind: SeenKind
  /** Dónde está (el museo de una obra); null para los lugares o si no se sabe. */
  where: string | null
  /** Una línea con lo básico (autor, año, qué es) para que el agente no arranque de cero. */
  about: string | null
}

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "kind", "where", "about"],
  properties: {
    name: {
      type: ["string", "null"],
      description:
        "Qué es, con su nombre propio en castellano: el lugar o monumento (como se busca en un mapa), la obra (ej. 'La Gioconda') o la cosa. null si no se puede saber o no hay nada para contar.",
    },
    kind: {
      type: "string",
      enum: SEEN_KINDS,
      description: "lugar: edificio, monumento, plaza, calle, puente, paisaje. obra: pintura, escultura, vitral, mural, tapiz. otro: lo demás (un plato típico, un objeto de museo).",
    },
    where: { type: ["string", "null"], description: "Para obra u otro: dónde está (ej. 'Museo del Louvre'). null para lugar o si no se sabe." },
    about: { type: ["string", "null"], description: "Una línea de máx. 20 palabras con lo básico: autor y año, o qué es. null si no estás seguro." },
  },
}

/** Qué hay en la foto, o null si no se puede saber. */
export async function describePhoto(photo: Photo, where: { label: string; city: string | null; location: LatLng }): Promise<PhotoSubject | null> {
  const context =
    `El viajero sacó esta foto cerca de ${where.label}` +
    `${where.city ? `, en ${where.city}` : ""} (${where.location.lat.toFixed(5)}, ${where.location.lng.toFixed(5)}). ` +
    "¿Qué es lo principal de la foto: un lugar, una obra de arte u otra cosa? Puede estar adentro de un museo o una iglesia. " +
    "Si no estás seguro o no hay nada para contar, name null."

  const answer = answerSchema.parse(
    await callStructured({
      model: VISION_MODEL,
      effort: "none",
      maxOutputTokens: 150,
      timeoutMs: VISION.llmTimeoutMs,
      content: [
        { type: "input_text", text: context },
        { type: "input_image", image_url: `data:${photo.mime};base64,${Buffer.from(photo.bytes).toString("base64")}`, detail: "low" },
      ],
      schemaName: "foto",
      schema: JSON_SCHEMA,
    })
  )
  const name = answer.name?.trim()
  if (!name) return null
  return { name, kind: answer.kind, where: answer.where?.trim() || null, about: answer.about?.trim() || null }
}
