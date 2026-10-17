/**
 * Tools del agente: un único registro con el esquema zod de cada uno. De acá salen
 * las definiciones que se mandan a OpenAI y la validación del lado del server.
 *
 * zod 4: los parámetros opcionales van con `.nullable()`, nunca `.optional()`
 * (todas las propiedades tienen que estar en `required`).
 */
import { z } from "zod"

import type { PlaceCard } from "@/hooks/voice-session-types"
import type { GenUiRequest } from "@/lib/genui/types"
import { DIETS, INTEREST_TAGS } from "@/lib/agent/rank"
import { EVENT_KIND_NAMES } from "@/lib/events/paris"

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
  search_places: z.object({
    query: z.string().min(2).max(120).describe("Qué buscar, como lo diría en Google: 'crêperie', 'farmacia', 'el Louvre'."),
    open_now: z.boolean().nullable().describe("true si lo necesita abierto ahora. null si no importa."),
  }),
  search_events: z.object({
    when: z.enum(["now", "today", "tomorrow"]).describe("now = está pasando o empieza en las próximas 3 horas."),
    kind: z.enum(EVENT_KIND_NAMES).nullable().describe("Qué tipo de evento pidió. null si cualquiera."),
    free_only: z.boolean().nullable().describe("true si lo quiere gratis. null si no importa."),
  }),
  web_search: z.object({
    question: z.string().min(3).max(200).describe("Qué querés averiguar, corto: 'menú', 'tienen medialunas', 'horario de brunch'."),
    place_name: z.string().max(120).nullable().describe("El lugar del que se habla, si es sobre uno. null si es una pregunta general."),
  }),
  get_place: z.object({
    place_name: z.string().min(2).max(120).describe("Nombre del lugar, como aparece en la lista o en un resultado."),
  }),
  edit_itinerary: z.object({
    op: z.enum(["add", "move", "remove", "done", "skip", "undo"]),
    item_ref: z.string().max(36).nullable().describe("Ref entre corchetes del plan (para move, remove, done, skip)."),
    place_name: z.string().max(120).nullable().describe("Para add: el lugar a agregar, si es uno conocido."),
    title: z.string().max(120).nullable().describe("Para add sin lugar conocido: qué es ('Cena con amigos')."),
    start_time: z.string().max(5).nullable().describe("Hora local HH:MM (para add y move)."),
    end_time: z.string().max(5).nullable().describe("Hora local HH:MM de fin. null = la duración típica."),
    date: z.string().max(10).nullable().describe("YYYY-MM-DD si no es hoy. null = hoy."),
  }),
  remember: z.object({
    statement: z.string().min(3).max(300).describe("Lo que hay que recordar, en tercera persona: 'Es vegetariana'."),
    kind: z.enum(["constraint", "preference"]).describe("constraint = no negociable (dieta, movilidad); preference = gusto."),
    avoid: z.boolean().describe("true si es algo que evita o no le gusta."),
    diet: z
      .enum(DIETS)
      .nullable()
      .describe("Si es una restricción de comida, cuál. null si no es de comida."),
  }),
  show_ui: z.object({
    request: z
      .string()
      .min(2)
      .max(300)
      .describe("Qué mostrar, con los nombres: 'ruta al Museo Picasso', 'comparar Café Charlot y Merci', 'plan de la tarde hasta la clase'."),
  }),
} as const

export type ToolResult = {
  /** Lo que lee el modelo: JSON corto, pocos campos (se cobra como tokens de entrada). */
  output: string
  /** Lugares para mostrar como tarjetas en la llamada. */
  cards: PlaceCard[]
  /** Pantalla generada a pedir (UI generativa). */
  ui?: GenUiRequest
}

export type ToolName = keyof typeof toolSchemas
export type ToolArgs<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>

const descriptions: Record<ToolName, string> = {
  recommend_nearby:
    "Busca hasta 3 lugares cercanos que entran en el tiempo libre y van con sus gustos. Usalo siempre que pida qué hacer o adónde ir.",
  search_places:
    "Busca en Google un lugar puntual o un tipo de lugar que no está en la lista de cercanos (una farmacia, una crêperie, un lugar por su nombre). Tarda unos segundos: antes de llamarlo decí una frase corta como 'dejame buscar'.",
  search_events:
    "Busca eventos cerca en la agenda de la ciudad (conciertos, teatro, exposiciones, ferias, charlas): qué hay ahora, esta noche, hoy o mañana. Decí algo corto como 'me fijo qué hay' antes de llamarlo.",
  web_search:
    "Busca en Google lo que no sabés de un lugar o del momento: el menú, si tienen algo puntual, precios, eventos, noticias. Es rápido; decí algo corto como 'me fijo' antes de llamarlo. Lo que encuentres puede estar desactualizado: decí de dónde lo sacaste.",
  get_place:
    "Detalle de un lugar: descripción, si está abierto ahora, el horario de hoy, minutos a pie y de visita. Usalo cuando pregunte por un lugar puntual.",
  edit_itinerary:
    "Cambia el plan del viaje: add (agrega un lugar o actividad), move (cambia el horario), remove, done, skip, undo (deshace el último cambio). Devuelve el plan de hoy actualizado. Las reservas no se pueden cambiar.",
  remember:
    "Guarda algo que contó de sí y sirve para después: qué come, qué evita, qué le gusta, cómo se mueve. Las restricciones de comida se respetan en las próximas recomendaciones.",
  show_ui:
    "Muestra una pantalla que acompaña lo que decís: una ruta ('llevame a…'), una comparación o un plan de varias paradas. No hace falta para recomendaciones: esas ya se muestran solas. Es instantáneo: no lo anuncies.",
}

export const isToolName = (name: string): name is ToolName => Object.hasOwn(toolSchemas, name)

/** Definiciones para `session.tools` de OpenAI Realtime. */
export const TOOL_DEFINITIONS = Object.entries(toolSchemas).map(([name, schema]) => {
  const parameters: Record<string, unknown> = { ...z.toJSONSchema(schema) }
  delete parameters.$schema
  return { type: "function" as const, name, description: descriptions[name as ToolName], parameters }
})
