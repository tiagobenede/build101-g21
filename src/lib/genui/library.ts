/**
 * Biblioteca de UI generativa (OpenUI). Un solo lugar define nombre, esquema y
 * descripción de cada componente; el server la arma sin React (solo para el prompt)
 * y el cliente con nuestros componentes. Así los dos lados hablan el mismo idioma.
 *
 * Los componentes reciben IDs de lugares, nunca datos sueltos: nombre, minutos y
 * rating los pone el server, así el modelo no puede inventarlos.
 */
import { createLibrary, defineComponent } from "@openuidev/lang-core"
import { z } from "zod"

export const GENUI_COMPONENTS = [
  "Screen",
  "Say",
  "PlaceHero",
  "PlaceList",
  "RouteMap",
  "Compare",
  "Stop",
  "Timeline",
  "Weather",
] as const
export type GenUiComponentName = (typeof GENUI_COMPONENTS)[number]

const placeId = z.string().describe("id de un lugar de la lista `places` (nunca inventes ids)")

export const genUiSchemas = {
  Say: z.object({ text: z.string().describe("Una frase corta (máx. 20 palabras) que acompaña lo que dice la voz") }),
  PlaceHero: z.object({
    placeId,
    reason: z.string().describe("Por qué se lo recomendás, en pocas palabras"),
  }),
  PlaceList: z.object({ placeIds: z.array(placeId).describe("2 o 3 alternativas") }),
  RouteMap: z.object({ placeId: placeId.describe("Destino de la caminata desde donde está el viajero") }),
  Compare: z.object({ placeIds: z.array(placeId).describe("2 o 3 lugares para comparar a pie y por rating") }),
  Stop: z.object({
    time: z.string().describe("Hora local HH:MM"),
    placeId: placeId.nullable(),
    title: z.string().nullable().describe("Solo si no es un lugar de la lista (ej. una actividad del itinerario)"),
  }),
  Weather: z.object({}),
} as const

const descriptions: Record<GenUiComponentName, string> = {
  Screen: "Raíz: la pantalla que acompaña la respuesta de voz. Ordená los bloques de lo más importante a lo menos.",
  Say: "Frase corta arriba de todo.",
  PlaceHero: "Un lugar destacado con foto, minutos a pie, tiempo de visita y por qué. Para LA recomendación principal.",
  PlaceList: "Lista compacta de alternativas.",
  RouteMap: "Mapa con la caminata hasta un lugar y cuánto tarda. Para 'llevame a…' o '¿cómo llego?'.",
  Compare: "Tabla para elegir entre 2 o 3 lugares.",
  Stop: "Una parada de un Timeline.",
  Timeline: "Plan de varias paradas con horario, para 'armame la tarde'. Respetá las actividades fijas del itinerario.",
  Weather: "Chip con el clima actual. Solo si cambia la recomendación (lluvia, frío, calor).",
}

/** Arma la biblioteca con los renderers que le pases (React en el cliente, null en el server). */
export function buildGenUiLibrary<C>(renderers: Record<GenUiComponentName, C>) {
  const Say = defineComponent({ name: "Say", props: genUiSchemas.Say, description: descriptions.Say, component: renderers.Say })
  const PlaceHero = defineComponent({
    name: "PlaceHero",
    props: genUiSchemas.PlaceHero,
    description: descriptions.PlaceHero,
    component: renderers.PlaceHero,
  })
  const PlaceList = defineComponent({
    name: "PlaceList",
    props: genUiSchemas.PlaceList,
    description: descriptions.PlaceList,
    component: renderers.PlaceList,
  })
  const RouteMap = defineComponent({
    name: "RouteMap",
    props: genUiSchemas.RouteMap,
    description: descriptions.RouteMap,
    component: renderers.RouteMap,
  })
  const Compare = defineComponent({
    name: "Compare",
    props: genUiSchemas.Compare,
    description: descriptions.Compare,
    component: renderers.Compare,
  })
  const Stop = defineComponent({ name: "Stop", props: genUiSchemas.Stop, description: descriptions.Stop, component: renderers.Stop })
  const Timeline = defineComponent({
    name: "Timeline",
    props: z.object({ stops: z.array(Stop.ref) }),
    description: descriptions.Timeline,
    component: renderers.Timeline,
  })
  const Weather = defineComponent({
    name: "Weather",
    props: genUiSchemas.Weather,
    description: descriptions.Weather,
    component: renderers.Weather,
  })
  const block = z.union([Say.ref, PlaceHero.ref, PlaceList.ref, RouteMap.ref, Compare.ref, Timeline.ref, Weather.ref])
  const Screen = defineComponent({
    name: "Screen",
    props: z.object({ blocks: z.array(block) }),
    description: descriptions.Screen,
    component: renderers.Screen,
  })

  return createLibrary({
    components: [Screen, Say, PlaceHero, PlaceList, RouteMap, Compare, Stop, Timeline, Weather],
    root: "Screen",
  })
}

export const GENUI_EXAMPLES = [
  `root = Screen([say, hero, alts])
say = Say("Con una hora te da justo para el Picasso.")
hero = PlaceHero("picasso", "Arte y tenés tiempo de sobra")
alts = PlaceList(["carnavalet", "vosges"])`,
  `root = Screen([say, map])
say = Say("Son 9 minutos caminando.")
map = RouteMap("picasso")`,
  `root = Screen([say, wx, plan])
say = Say("Te armé la tarde para llegar a la clase.")
wx = Weather()
plan = Timeline([s1, s2, s3])
s1 = Stop("16:15", "picasso", null)
s2 = Stop("17:25", "vosges", null)
s3 = Stop("18:00", null, "Clase de cocina")`,
]
