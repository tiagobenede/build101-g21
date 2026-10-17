/**
 * Lee una página para sacar lo que un fragmento de búsqueda no trae (el menú).
 * Lo puro (HTML → texto, buscar el link al menú, recortar) se testea solo; `readMenu`
 * baja como mucho dos páginas: la web y, si hace falta, su página de menú.
 */

/** Varias webs de restaurantes redirigen y tardan ~2 s solo en el primer salto. */
const FETCH_TIMEOUT_MS = 4_000
const MAX_HTML_CHARS = 1_500_000
export const EXCERPT_MAX_CHARS = 800

const MENU_WORDS = /\b(menu|menú|carte|la-carte|nos-produits|produits|carta|speisekarte)\b/i
/** Palabras de la pregunta que no ayudan a encontrar la parte útil de la página. */
const STOPWORDS = new Set([
  "menu", "menú", "carta", "tienen", "tiene", "hay", "sirven", "venden", "que", "qué", "para", "como", "cómo",
  "precio", "precios", "platos", "algo", "donde", "dónde", "cuanto", "cuánto", "esta", "este", "with", "the",
])

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" }

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

/** Link a la página de menú dentro del mismo sitio, o null. */
export function findMenuLink(html: string, pageUrl: string): string | null {
  const base = new URL(pageUrl)
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, label] = m
    if (!MENU_WORDS.test(href) && !MENU_WORDS.test(htmlToText(label))) continue
    try {
      const url = new URL(href, base)
      if (url.hostname === base.hostname && /^https?:$/.test(url.protocol) && url.href !== base.href) return url.href
    } catch {
      // href inválido: seguimos con el próximo
    }
  }
  return null
}

const stem = (w: string) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(es|s)$/, "")

/** Palabras de la pregunta para buscar en la página ("¿tienen croissants?" → croissant). */
export function questionKeywords(question: string): string[] {
  return [...new Set(question.split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase())).map(stem))]
}

/**
 * La parte útil de la página: alrededor de las palabras de la pregunta si aparecen,
 * si no alrededor de "menú/carte", si no el principio.
 */
export function excerptFor(text: string, keywords: string[]): string {
  const plain = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const hit = keywords.map((k) => plain.indexOf(k)).filter((i) => i >= 0)
  const menuAt = plain.search(/\b(menu|carte|carta)\b/)
  const at = hit.length > 0 ? Math.min(...hit) : menuAt
  const start = at > 0 ? Math.max(0, at - 150) : 0
  const excerpt = text.slice(start, start + EXCERPT_MAX_CHARS).replace(/\n/g, " · ")
  return start + EXCERPT_MAX_CHARS < text.length ? `${excerpt}…` : excerpt
}

/** Solo sitios públicos: nada de localhost ni redes privadas (la URL viene de un resultado de búsqueda). */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (!/^https?:$/.test(url.protocol)) return false
    const host = url.hostname
    return !(
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.includes(":")
    )
  } catch {
    return false
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  if (!isPublicHttpUrl(url)) return null
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) RumboBot/1.0", "Accept-Language": "es,fr;q=0.8,en;q=0.6" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    })
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null
    return (await res.text()).slice(0, MAX_HTML_CHARS)
  } catch {
    return null
  }
}

export type MenuExcerpt = { url: string; excerpt: string }

/**
 * Lo que dice la web sobre la pregunta. Si en la portada no aparece, sigue un link
 * a la página de menú del mismo sitio. null si no se pudo leer.
 */
export async function readMenu(url: string, question: string): Promise<MenuExcerpt | null> {
  const keywords = questionKeywords(question)
  const html = await fetchHtml(url)
  if (!html) return null
  const text = htmlToText(html)
  const plain = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const found = keywords.some((k) => plain.includes(k))

  if (!found) {
    const menuUrl = findMenuLink(html, url)
    const menuHtml = menuUrl ? await fetchHtml(menuUrl) : null
    if (menuUrl && menuHtml) return { url: menuUrl, excerpt: excerptFor(htmlToText(menuHtml), keywords) }
  }
  return text ? { url, excerpt: excerptFor(text, keywords) } : null
}
