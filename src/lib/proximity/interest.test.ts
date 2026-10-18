import { describe, expect, it } from "vitest"

import { buildInterestQuestion, distinctInterestPlaces, MAX_INTEREST_OPTIONS, NONE_KEY, optionsSignature, readInterestChoice, type InterestPlace, type TravelerSnapshot } from "./interest"

const HERE = { lat: 48.8556, lng: 2.3655 }
const place = (i: number, over: Partial<InterestPlace> = {}): InterestPlace => ({
  kind: "interest",
  placeId: `g:${i}`,
  name: `Lugar ${i}`,
  category: "Café",
  matchedTags: ["café"],
  rating: 4.5,
  description: "Café de especialidad.",
  lat: HERE.lat + (i * 10) / 111_320,
  lng: HERE.lng,
  ...over,
})
const traveler: TravelerSnapshot = {
  interests: ["comida", "café"],
  constraints: "dieta: sin gluten",
  profileSummary: "Evita: lugares con mucha fila.",
  localTime: "15:05",
  whereLabel: "Place des Vosges",
  todayPlan: ["18:00 Clase de cocina (reserva)"],
  nextCommitment: "Clase de cocina a las 18:00 (reserva, en 175 min)",
}

describe("buildInterestQuestion", () => {
  it("arma una opción por lugar más 'ninguno', y el contexto del viajero", () => {
    const { criteria, options, state } = buildInterestQuestion([place(1), place(2, { rating: null, description: null, matchedTags: [] })], HERE, traveler)
    expect(criteria).toEqual({
      p1: "Lugar 1 (Café, ★4.5, a 10 m): Café de especialidad. Va con: café.",
      p2: "Lugar 2 (Café, a 20 m). Va con: -.",
      [NONE_KEY]: "Ninguno vale un aviso ahora.",
    })
    expect(options.get("p2")?.placeId).toBe("g:2")
    expect(state.viajero.restricciones_no_negociables).toBe("dieta: sin gluten")
    expect(state.proximo_compromiso).toContain("Clase de cocina")
  })

  it("no pasa más de MAX_INTEREST_OPTIONS opciones", () => {
    const { options } = buildInterestQuestion(Array.from({ length: 12 }, (_, i) => place(i)), HERE, traveler)
    expect(options.size).toBe(MAX_INTEREST_OPTIONS)
  })
})

describe("readInterestChoice", () => {
  const { options } = buildInterestQuestion([place(1)], HERE, traveler)

  it("devuelve el lugar si Jev está seguro", () => {
    expect(readInterestChoice({ choice: "p1", confidence: 0.8 }, options)?.placeId).toBe("g:1")
  })

  it("null con 'ninguno', poca confianza o clave desconocida", () => {
    expect(readInterestChoice({ choice: NONE_KEY, confidence: 0.9 }, options)).toBeNull()
    expect(readInterestChoice({ choice: "p1", confidence: 0.5 }, options)).toBeNull()
    expect(readInterestChoice({ choice: "p9", confidence: 0.9 }, options)).toBeNull()
  })
})

describe("optionsSignature", () => {
  it("no depende del orden", () => {
    expect(optionsSignature([place(1), place(2)])).toBe(optionsSignature([place(2), place(1)]))
  })
})

describe("distinctInterestPlaces", () => {
  const names = (ps: InterestPlace[]) => ps.map((p) => p.name)
  const louvre = place(0, { name: "Museo del Louvre", ratingCount: 380_389 })

  it("saca las fichas con pocas reseñas o sin reseñas", () => {
    const duplicate = place(9, { name: "Museo del Louvre", ratingCount: 1 })
    const empty = place(8, { name: "ルーヴル美術館", rating: null, ratingCount: null })
    expect(names(distinctInterestPlaces([louvre, duplicate, empty]))).toEqual(["Museo del Louvre"])
  })

  it("junta lo que está en el mismo punto que un lugar mucho más conocido", () => {
    const room = { ...place(1, { name: "Appartements Napoléon III", ratingCount: 82 }), lat: louvre.lat, lng: louvre.lng }
    expect(names(distinctInterestPlaces([louvre, room]))).toEqual(["Museo del Louvre"])
  })

  it("deja dos lugares conocidos en el mismo punto, y los que están más lejos", () => {
    const twin = { ...place(1, { name: "Café vecino", ratingCount: 60_000 }), lat: louvre.lat, lng: louvre.lng }
    const away = place(5, { name: "Galerie", ratingCount: 155 }) // a 50 m
    expect(names(distinctInterestPlaces([louvre, twin, away]))).toEqual(["Museo del Louvre", "Café vecino", "Galerie"])
  })

  it("un ala del mismo tipo y con el nombre del lugar, a menos de 300 m, es parte de él", () => {
    const wing = place(14, { name: "Musée du Louvre - Galerie des Antiquités", category: "Museo", ratingCount: 155 }) // a 140 m
    const museum = { ...louvre, category: "Museo" }
    expect(names(distinctInterestPlaces([museum, wing]))).toEqual(["Museo del Louvre"])
    // Aunque el museo esté fuera del radio del aviso: se lo pasa como lugar de la zona.
    expect(names(distinctInterestPlaces([wing], [museum, wing]))).toEqual([])
  })

  it("otro tipo de lugar con el mismo nombre no es parte (la Ladurée del Carrousel du Louvre)", () => {
    const shop = place(10, { name: "Ladurée Carrousel du Louvre", category: "Café", ratingCount: 400 })
    expect(names(distinctInterestPlaces([{ ...louvre, category: "Museo" }, shop]))).toEqual(["Museo del Louvre", "Ladurée Carrousel du Louvre"])
  })

  it("solo palabras genéricas en común (Musée, Galerie) no alcanza", () => {
    const other = place(10, { name: "Galerie Vivienne", category: "Museo", ratingCount: 300 })
    const big = place(0, { name: "Musée Galerie Nationale", category: "Museo", ratingCount: 50_000 })
    expect(distinctInterestPlaces([big, other])).toHaveLength(2)
  })

  it("con puntaje pero sin el dato de reseñas, no lo saca", () => {
    expect(distinctInterestPlaces([place(1)])).toHaveLength(1)
  })
})
