/**
 * Tools del agente: un único registro con el esquema zod de cada uno. De acá salen
 * las definiciones que se mandan a OpenAI y la validación del lado del server.
 *
 * zod 4: los parámetros opcionales van con `.nullable()`, nunca `.optional()`
 * (todas las propiedades tienen que estar en `required`).
 */
import { z } from "zod"

import type { PlaceCard } from "@/hooks/voice-session-types"
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
    max_walk_minutes: z
      .number()
      .nullable()
      .describe("Minutos a pie como mucho. 'Cerca' o 'por acá' → 10; si dice que no le importa caminar, más (ej. 30). null = 10 para comida o café, 20 para lo demás."),
  }),
  search_places: z.object({
    query: z.string().min(2).max(120).describe("Qué buscar, como lo diría en Google: 'crêperie', 'farmacia', 'el Louvre'."),
    open_now: z.boolean().nullable().describe("true si lo necesita abierto ahora. null si no importa."),
    max_walk_minutes: z
      .number()
      .nullable()
      .describe("Minutos a pie como mucho. Para un tipo de lugar (una crêperie, un café) → 10, o más si dice que no le importa caminar. null solo para un lugar por su nombre."),
  }),
  search_events: z.object({
    when: z.enum(["now", "today", "tomorrow"]).describe("now = está pasando o empieza en las próximas 3 horas; today = lo que queda de hoy, también 'esta noche'."),
    kind: z.enum(EVENT_KIND_NAMES).nullable().describe("Qué tipo de evento pidió (un concierto → música). null si no dijo el tipo."),
    free_only: z.boolean().nullable().describe("true si lo quiere gratis. null si no importa."),
  }),
  web_search: z.object({
    question: z.string().min(3).max(200).describe("Qué querés averiguar, corto: 'menú', 'tienen medialunas', 'horario de brunch'."),
    place_name: z.string().max(120).nullable().describe("El lugar del que se habla, si es sobre uno. null si es una pregunta general."),
  }),
  place_facts: z.object({
    subject: z
      .string()
      .min(2)
      .max(160)
      .describe("De qué: el lugar, la obra, el barrio o lo de la foto, con su nombre propio ('Centre Pompidou', 'La Gioconda, Louvre', 'el Marais')."),
    question: z.string().max(200).nullable().describe("Lo que preguntó, si fue algo puntual ('¿por qué tiene tubos?'). null para que le cuentes en general."),
  }),
  show_phrase: z.object({
    text: z.string().min(1).max(300).describe("La frase en el idioma local, lista para decir: 'Bonjour, un croissant, s'il vous plaît.'"),
    translation: z.string().min(1).max(300).describe("Qué significa, en castellano."),
    pronunciation: z
      .string()
      .max(300)
      .nullable()
      .describe("Cómo se lee para un hispanohablante, simple: 'bonyúr, an cruasán, sil vu plé'. null si se lee como se escribe."),
    lang: z.string().min(2).max(20).describe("Idioma BCP 47 para leerla en voz alta: 'fr-FR', 'it-IT', 'pt-BR'."),
  }),
  get_place: z.object({
    place_name: z.string().min(2).max(120).describe("Nombre del lugar, como aparece en la lista o en un resultado."),
  }),
  show_route: z.object({
    place_name: z.string().min(2).max(120).describe("El lugar adonde quiere ir, con el nombre que aparece en la pantalla o en un resultado."),
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
    kind: z
      .enum(["constraint", "preference"])
      .describe("Solo 'constraint' (no negociable: dieta, movilidad) o 'preference' (gusto). Algo que evita es preference con avoid true."),
    avoid: z.boolean().describe("true si es algo que evita o no le gusta."),
    diet: z
      .enum(DIETS)
      .nullable()
      .describe("Si es una restricción de comida, cuál. null si no es de comida."),
    interest: z
      .enum(INTEREST_TAGS)
      .nullable()
      .describe("El gusto de la lista que corresponde ('me encantan los autos clásicos' → autos). null si no encaja en ninguno."),
  }),
  translation_transcript: z.object({}),
  open_translator: z.object({}),
} as const

export type ToolResult = {
  /** Lo que lee el modelo: JSON corto, pocos campos (se cobra como tokens de entrada). */
  output: string
  /** Lugares para mostrar como tarjetas en la llamada. */
  cards: PlaceCard[]
  /** show_route: adonde va, para avisarle al agente cuando llega. */
  destination?: { name: string; lat: number; lng: number }
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
    "Busca en Google lo que no sabés de un lugar o del momento: el menú, si tienen algo puntual, precios, eventos, noticias. Es rápido; decí algo corto como 'me fijo' antes de llamarlo. Lo que encuentres puede estar desactualizado. No leas nombres de sitios web en voz alta.",
  place_facts:
    "Datos de guía seguros (quién, cuándo, para qué, una anécdota) de un lugar, una obra, un barrio o lo de la foto. Usalo siempre que pregunte qué es algo, pida que le cuentes más, la historia o un dato curioso. Los datos también aparecen en la pantalla.",
  show_phrase:
    "Muestra en la pantalla una frase en el idioma local para que la diga (o la toque y suene), con la traducción y cómo se lee. Usalo cuando pregunte cómo se dice algo o qué decirle a alguien (pedir, preguntar, agradecer). Decí la frase vos también.",
  get_place:
    "Datos prácticos de un lugar: si está abierto ahora, el horario de hoy, el teléfono, minutos a pie y de visita. Usalo cuando pregunte eso de un lugar puntual; para contar su historia no hace falta.",
  show_route:
    "Muestra en la pantalla el mapa con la caminata hasta un lugar y devuelve los minutos y metros reales a pie. Usalo cuando quiera ir a un lugar: 'llevame', 'dale, vamos', '¿cómo llego?', 'mostrame cómo ir'.",
  edit_itinerary:
    "Cambia el plan del viaje: add (agrega un lugar o actividad), move (cambia el horario), remove, done, skip, undo (deshace el último cambio). Devuelve el plan de hoy actualizado. Las reservas no se pueden cambiar.",
  remember:
    "Guarda algo que contó de sí y sirve para después: qué come, qué evita, qué le gusta, cómo se mueve. Con interest, el gusto entra en su perfil y en las próximas recomendaciones (con avoid, se saca). Las restricciones de comida se respetan siempre.",
  open_translator:
    "Abre el traductor en la pantalla para que el viajero hable con una persona local (en un hotel, una boletería, un negocio). Usalo solo si aceptó la ayuda o lo pidió. Antes decí una sola frase corta ('dale, te abro el traductor'): mientras está abierto no escuchás ni hablás.",
  translation_transcript:
    "La charla entera que el viajero tuvo hace un rato con una persona local usando el traductor (lo que dijo cada uno, en el original y traducido). Usalo cuando necesites lo que se dijo exactamente y el resumen no alcanza.",
}

export const isToolName = (name: string): name is ToolName => Object.hasOwn(toolSchemas, name)

/**
 * Realtime no exige el esquema estricto: a veces el modelo omite los campos que no usa
 * (`edit_itinerary` sin `item_ref` ni `title`). Los que aceptan null y faltan, quedan en null.
 */
export function fillMissingNulls(name: ToolName, args: unknown): unknown {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return args
  const filled: Record<string, unknown> = { ...args }
  for (const [key, field] of Object.entries(toolSchemas[name].shape)) {
    if (filled[key] === undefined && (field as z.ZodType).safeParse(null).success) filled[key] = null
  }
  return filled
}

/** Definiciones para `session.tools` de OpenAI Realtime. */
export const TOOL_DEFINITIONS = Object.entries(toolSchemas).map(([name, schema]) => {
  const parameters: Record<string, unknown> = { ...z.toJSONSchema(schema) }
  delete parameters.$schema
  return { type: "function" as const, name, description: descriptions[name as ToolName], parameters }
})
