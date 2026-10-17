import { describe, expect, it } from "vitest"

import { excerptFor, findMenuLink, htmlToText, isPublicHttpUrl, questionKeywords } from "./web-page"

describe("htmlToText", () => {
  it("saca scripts y etiquetas y decodifica entidades", () => {
    const html = "<head><title>x</title></head><script>var a=1</script><p>Pain&nbsp;au chocolat</p><li>Cr&#233;pe L&#x27;Atelier</li>"
    expect(htmlToText(html)).toBe("Pain au chocolat\nCrépe L'Atelier")
  })
})

describe("findMenuLink", () => {
  it("encuentra el link al menú del mismo sitio", () => {
    const html = `<a href="https://instagram.com/menu">IG</a><a href="/la-carte">Nuestra carta</a>`
    expect(findMenuLink(html, "https://boulangerie.fr/")).toBe("https://boulangerie.fr/la-carte")
  })

  it("también por el texto del link", () => {
    expect(findMenuLink(`<a href="/p/12">Menu</a>`, "https://x.fr/")).toBe("https://x.fr/p/12")
    expect(findMenuLink(`<a href="/contact">Contacto</a>`, "https://x.fr/")).toBeNull()
  })
})

describe("questionKeywords y excerptFor", () => {
  it("se queda con lo que importa de la pregunta", () => {
    expect(questionKeywords("¿Tienen croissants en el menú?")).toEqual(["croissant"])
  })

  it("recorta alrededor de lo que se pregunta", () => {
    const text = `${"Historia de la casa. ".repeat(60)}Viennoiseries: croissant 1,50 €, pain au chocolat 1,80 €.`
    const out = excerptFor(text, ["croissant"])
    expect(out).toContain("croissant 1,50 €")
    expect(out.length).toBeLessThanOrEqual(801)
  })
})

describe("isPublicHttpUrl", () => {
  it("bloquea direcciones locales y privadas", () => {
    expect(isPublicHttpUrl("https://dupainetdesidees.com/")).toBe(true)
    expect(isPublicHttpUrl("http://localhost:3000/")).toBe(false)
    expect(isPublicHttpUrl("http://192.168.0.10/")).toBe(false)
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false)
  })
})
