import type { PlaceCard } from "@/hooks/voice-session-types"

import type { GenUiPhrase, GenUiStory } from "./types"

/** Tools cuyo resultado son lugares: lo que devuelven es lo que se ve en pantalla. */
const PLACE_TOOLS = new Set(["recommend_nearby", "search_places", "search_events", "get_place", "show_route"])
const MAX_SCREEN_PLACES = 6

export type ScreenUpdate =
  | { kind: "show"; request: string; placeIds: string[]; story?: GenUiStory; phrase?: GenUiPhrase }
  | { kind: "clear" }
  | { kind: "none" }

function describe(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "recommend_nearby": {
      const minutes = typeof args.available_minutes === "number" ? ` para ${args.available_minutes} minutos libres` : ""
      const interest = typeof args.interest === "string" ? `, con ganas de ${args.interest}` : ""
      return `Recomendaciones${minutes}${interest}`
    }
    case "search_places":
      return `Resultados de buscar "${String(args.query ?? "")}"`
    case "search_events":
      return "Eventos cerca"
    case "get_place":
      return `Detalle de ${String(args.place_name ?? "el lugar")}`
    default:
      return "Lugares"
  }
}

/** JSON de un objeto, o {} si no se puede leer (el pedido queda genérico, los lugares son los mismos). */
function parseObject(raw: unknown): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(typeof raw === "string" && raw ? raw : "{}")
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Un solo agente: la pantalla muestra exactamente los lugares que el agente acaba de recibir
 * de su tool (los mismos que va a nombrar), y se vacía si no encontró nada.
 */
export function screenFromTool(name: unknown, rawArgs: unknown, cards: PlaceCard[], output = ""): ScreenUpdate {
  if (typeof name !== "string") return { kind: "none" }
  const args = parseObject(rawArgs)

  // La historia y la frase se muestran con lo que el agente va a decir; si no hay datos, la pantalla queda como estaba.
  if (name === "place_facts") {
    const result = parseObject(output)
    const facts = Array.isArray(result.facts) ? result.facts.filter((f): f is string => typeof f === "string") : []
    const anecdote = typeof result.anecdote === "string" ? result.anecdote : null
    const subject = typeof args.subject === "string" ? args.subject : ""
    if (!subject || (facts.length === 0 && !anecdote)) return { kind: "none" }
    return { kind: "show", request: `La historia de ${subject}`, placeIds: [], story: { subject, facts, anecdote } }
  }
  if (name === "show_phrase") {
    const { text, translation, pronunciation, lang } = args
    if (typeof text !== "string" || typeof translation !== "string" || typeof lang !== "string") return { kind: "none" }
    return {
      kind: "show",
      request: `Cómo decir: "${translation}"`,
      placeIds: [],
      phrase: { text, translation, lang, pronunciation: typeof pronunciation === "string" ? pronunciation : null },
    }
  }

  if (!PLACE_TOOLS.has(name)) return { kind: "none" }
  if (cards.length === 0) return { kind: "clear" }
  // "Llevame": el mismo pedido que el botón de la tarjeta, así la pantalla es el mapa.
  if (name === "show_route") return { kind: "show", request: `Llevame a ${cards[0].name}`, placeIds: [cards[0].id] }
  return { kind: "show", request: describe(name, args), placeIds: cards.slice(0, MAX_SCREEN_PLACES).map((c) => c.id) }
}
