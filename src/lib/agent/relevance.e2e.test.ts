/**
 * Casos de relevancia contra Google Places de verdad: desde un punto, lo que pide el
 * viajero tiene que traer el lugar obvio. Cuesta plata, así que está apagada por defecto:
 *
 *   npm run test:relevance
 *
 * Cada caso se prueba por los dos caminos de recommend_nearby: la caché de Nearby Search
 * (tipos que pedimos alrededor) y el fallback por Text Search cuando la caché no tiene nada.
 */
import { describe, expect, it, vi } from "vitest"

import { SHOP_TYPES } from "@/lib/places/google-types"

vi.mock("server-only", () => ({}))
// supabase-js pide WebSocket al crear el cliente; Node 20 no lo trae y acá no usamos Realtime.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}

const enabled = process.env.RELEVANCE_E2E === "1"
if (enabled) process.loadEnvFile(".env.local")

type RelevanceCase = {
  name: string
  at: { lat: number; lng: number }
  city: string
  interest: string
  nearbyTypes: string[]
  expected: string
}

const CASES: RelevanceCase[] = [
  {
    name: "compras desde Av. Ramón Anador y Av. Luis Alberto de Herrera (Montevideo)",
    at: { lat: -34.8955684, lng: -56.1432655 },
    city: "Montevideo",
    interest: "compras",
    nearbyTypes: SHOP_TYPES,
    expected: "Montevideo Shopping",
  },
]

describe.skipIf(!enabled)("relevancia de lugares", () => {
  for (const c of CASES) {
    it(`Nearby Search: ${c.name} → ${c.expected}`, async () => {
      const { searchNearby } = await import("@/lib/places/nearby")
      const found = await searchNearby(process.env.GOOGLE_API_KEY ?? "", c.at, {
        includedTypes: c.nearbyTypes,
        radius: 1_500,
        rankPreference: "POPULARITY",
      })
      const names = found.map((g) => g.displayName?.text ?? "")
      expect(names).toContain(c.expected)
    })

    it(`contexto del agente: ${c.name} → ${c.expected} entre los lugares que conoce y primero al recomendar`, async () => {
      const { searchNearby } = await import("@/lib/places/nearby")
      const { nearbyQueries } = await import("@/lib/places/nearby-plan")
      const { toPlaceRow } = await import("@/lib/places/google-types")
      const { distanceMeters, walkMinutes } = await import("@/lib/geo")
      const { pickContextPlaces } = await import("@/lib/realtime/context-places")
      const { MAX_PLACES_IN_CONTEXT } = await import("@/lib/realtime/config")

      // Lo mismo que guarda ensureNearbyPlaces y arma getTravelerContext, sin pasar por la base.
      const results = await Promise.all(nearbyQueries(c.at).map((q) => searchNearby(process.env.GOOGLE_API_KEY ?? "", c.at, q)))
      const byId = new Map(
        results
          .flat()
          .map((g) => toPlaceRow(g, c.city))
          .filter((r) => r !== null)
          .map((r) => [r.id, { ...r, distanceMeters: distanceMeters(c.at, r), walkMinutes: walkMinutes(c.at, r) }])
      )
      const names = pickContextPlaces([...byId.values()], MAX_PLACES_IN_CONTEXT).map((p) => p.name)
      expect(names).toContain(c.expected)

      // Y recommend_nearby con lo guardado lo pone primero.
      const { rankPlaces } = await import("./rank")
      const ranked = rankPlaces({
        places: [...byId.values()],
        interests: [],
        requestedTag: c.interest,
        availableMinutes: 120,
        alreadyRecommended: [],
      })
      expect(ranked[0]?.place.name).toBe(c.expected)
    })

    it(`fallback de Text Search: ${c.name} → ${c.expected} primero en el ranking`, async () => {
      const { searchPlaces } = await import("@/lib/places/search")
      const { interestQuery, tagWithInterest } = await import("./interest-fallback")
      const { rankPlaces } = await import("./rank")

      const found = await searchPlaces(interestQuery(c.interest), null, c.at, c.city)
      const ranked = rankPlaces({
        places: tagWithInterest(found, c.interest),
        interests: [],
        requestedTag: c.interest,
        availableMinutes: 120,
        alreadyRecommended: [],
      })
      expect(ranked[0]?.place.name).toBe(c.expected)
    })
  }
})
