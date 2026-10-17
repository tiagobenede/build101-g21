/**
 * Tools del agente: un único registro con el esquema zod de cada uno. De acá salen
 * las definiciones que se mandan a OpenAI y la validación del lado del server.
 *
 * zod 4: los parámetros opcionales van con `.nullable()`, nunca `.optional()`
 * (todas las propiedades tienen que estar en `required`).
 */
import { z } from "zod"

import type { PlaceCard } from "@/hooks/voice-session-types"
import { INTEREST_TAGS } from "@/lib/agent/rank"

export const toolSchemas = {
  recommend_nearby: z.object({
    available_minutes: z
      .number()
      .nullable()
      .describe("Minutos libres que dijo el viajero. null si no lo dijo (se usa el próximo compromiso)."),
    interest: z
      .enum(INTEREST_TAGS)
      .nullable()
      .describe("Lo que quiere hacer ahora, si lo pidió (ej. 'tengo hambre' → comida). null para usar sus gustos."),
  }),
} as const

export type ToolResult = {
  /** Lo que lee el modelo: JSON corto, pocos campos (se cobra como tokens de entrada). */
  output: string
  /** Lugares para mostrar como tarjetas en la llamada. */
  cards: PlaceCard[]
}

export type ToolName = keyof typeof toolSchemas
export type ToolArgs<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>

const descriptions: Record<ToolName, string> = {
  recommend_nearby:
    "Busca hasta 3 lugares cercanos que entran en el tiempo libre y van con sus gustos. Usalo siempre que pida qué hacer o adónde ir.",
}

export const isToolName = (name: string): name is ToolName => Object.hasOwn(toolSchemas, name)

/** Definiciones para `session.tools` de OpenAI Realtime. */
export const TOOL_DEFINITIONS = Object.entries(toolSchemas).map(([name, schema]) => {
  const parameters: Record<string, unknown> = { ...z.toJSONSchema(schema) }
  delete parameters.$schema
  return { type: "function" as const, name, description: descriptions[name as ToolName], parameters }
})
