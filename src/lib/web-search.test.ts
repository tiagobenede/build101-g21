import { describe, expect, it } from "vitest"

import { compactSerper, pickReadableUrl, type WebResult } from "./web-search"

describe("compactSerper", () => {
  it("se queda con la respuesta destacada y 3 resultados con su dominio", () => {
    const organic = Array.from({ length: 5 }, (_, i) => ({
      title: `Resultado ${i}`,
      link: `https://www.sitio${i}.fr/menu`,
      snippet: "Croissants, pain au chocolat y café.",
    }))
    const out = compactSerper({ answerBox: { answer: "Sí, tienen croissants" }, organic })
    expect(out.answer).toBe("Sí, tienen croissants")
    expect(out.results).toHaveLength(3)
    expect(out.results[0]).toEqual({
      title: "Resultado 0",
      snippet: "Croissants, pain au chocolat y café.",
      source: "sitio0.fr",
      url: "https://www.sitio0.fr/menu",
    })
  })

  it("recorta fragmentos largos y descarta resultados incompletos", () => {
    const out = compactSerper({ organic: [{ title: "A", link: "https://a.fr", snippet: "x".repeat(500) }, { title: "B" }] })
    expect(out.answer).toBeNull()
    expect(out.results).toHaveLength(1)
    expect(out.results[0].snippet.length).toBe(220)
  })
})

describe("pickReadableUrl", () => {
  const r = (source: string): WebResult => ({ title: source, snippet: "", source, url: `https://${source}/` })

  it("prefiere la web oficial del lugar", () => {
    const results = [r("instagram.com"), r("tripadvisor.fr"), r("dupainetdesidees.com")]
    expect(pickReadableUrl(results, "Du Pain et des Idées")).toBe("https://dupainetdesidees.com/")
  })

  it("si no hay web oficial no lee ninguna (los directorios traen ruido)", () => {
    expect(pickReadableUrl([r("ubereats.com"), r("alloj.com")], "L'As du Fallafel")).toBeNull()
    expect(pickReadableUrl([r("instagram.com")], null)).toBeNull()
  })
})
