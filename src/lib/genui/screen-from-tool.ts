import type { PlaceCard } from "@/hooks/voice-session-types"

/** Tools cuyo resultado son lugares: lo que devuelven es lo que se ve en pantalla. */
const PLACE_TOOLS = new Set(["recommend_nearby", "search_places", "search_events", "get_place"])
const MAX_SCREEN_PLACES = 6

export type ScreenUpdate =
  | { kind: "show"; request: string; placeIds: string[] }
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

/**
 * Un solo agente: la pantalla muestra exactamente los lugares que el agente acaba de recibir
 * de su tool (los mismos que va a nombrar), y se vacía si no encontró nada.
 */
export function screenFromTool(name: unknown, rawArgs: unknown, cards: PlaceCard[]): ScreenUpdate {
  if (typeof name !== "string" || !PLACE_TOOLS.has(name)) return { kind: "none" }
  if (cards.length === 0) return { kind: "clear" }

  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(typeof rawArgs === "string" ? rawArgs : "{}") as Record<string, unknown>
  } catch {
    // Argumentos ilegibles: el pedido queda genérico, los lugares son los mismos.
  }
  return { kind: "show", request: describe(name, args), placeIds: cards.slice(0, MAX_SCREEN_PLACES).map((c) => c.id) }
}
