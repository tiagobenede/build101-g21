import { describe, expect, it } from "vitest"

import { screenFromTool } from "./screen-from-tool"

const card = (id: string) => ({ id, name: id, category: "Museo", description: null, walkMinutes: 5, stayMinutes: 30 })

describe("screenFromTool", () => {
  it("muestra exactamente los lugares que devolvió el tool, en su orden", () => {
    const s = screenFromTool("recommend_nearby", JSON.stringify({ available_minutes: 60, interest: "comida" }), [card("b"), card("a")])
    expect(s).toEqual({ kind: "show", request: "Recomendaciones para 60 minutos libres, con ganas de comida", placeIds: ["b", "a"] })
  })

  it("vacía la pantalla si un tool de lugares no encontró nada", () => {
    expect(screenFromTool("search_places", JSON.stringify({ query: "sushi" }), [])).toEqual({ kind: "clear" })
  })

  it("arma el pedido de búsquedas, eventos y detalle de un lugar", () => {
    expect(screenFromTool("search_places", JSON.stringify({ query: "crêperie" }), [card("x")])).toMatchObject({
      request: 'Resultados de buscar "crêperie"',
    })
    expect(screenFromTool("search_events", "{}", [card("e")])).toMatchObject({ request: "Eventos cerca" })
    expect(screenFromTool("get_place", JSON.stringify({ place_name: "Louvre" }), [card("l")])).toMatchObject({
      request: "Detalle de Louvre",
    })
  })

  it("show_route pide el mapa de la caminata al lugar, igual que el botón Llevame", () => {
    expect(screenFromTool("show_route", JSON.stringify({ place_name: "picasso" }), [card("picasso")])).toEqual({
      kind: "show",
      request: "Llevame a picasso",
      placeIds: ["picasso"],
    })
  })

  it("no toca la pantalla con tools que no son de lugares", () => {
    expect(screenFromTool("remember", "{}", [])).toEqual({ kind: "none" })
    expect(screenFromTool("edit_itinerary", "{}", [])).toEqual({ kind: "none" })
  })

  it("tolera argumentos ilegibles", () => {
    expect(screenFromTool("recommend_nearby", "no-json", [card("a")])).toMatchObject({ request: "Recomendaciones" })
  })
})
