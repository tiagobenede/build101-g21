/**
 * Búsqueda web rápida para lo que Google Places no sabe (menús, si tienen algo
 * puntual, eventos, noticias). Serper devuelve resultados de Google en ~1 s y el
 * modelo de voz lee los fragmentos directo: sin un segundo modelo que resuma.
 */

const SERPER_URL = "https://google.serper.dev/search"
const TIMEOUT_MS = 5_000
const MAX_RESULTS = 3
const SNIPPET_MAX_CHARS = 220
const CACHE_MS = 60 * 60 * 1000

export type WebResult = { title: string; snippet: string; source: string; url: string }
export type WebAnswer = { answer: string | null; results: WebResult[] }

type SerperResponse = {
  answerBox?: { answer?: string; snippet?: string }
  knowledgeGraph?: { description?: string }
  organic?: { title?: string; link?: string; snippet?: string }[]
}

const clip = (s: string) => (s.length > SNIPPET_MAX_CHARS ? `${s.slice(0, SNIPPET_MAX_CHARS - 1)}…` : s)

const domainOf = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^www\./, "")
  } catch {
    return link
  }
}

/** Lo mínimo para que el modelo conteste y diga de dónde lo sacó. */
export function compactSerper(body: SerperResponse): WebAnswer {
  const answer = body.answerBox?.answer ?? body.answerBox?.snippet ?? body.knowledgeGraph?.description ?? null
  const results = (body.organic ?? [])
    .filter((r): r is { title: string; link: string; snippet: string } => Boolean(r.title && r.link && r.snippet))
    .slice(0, MAX_RESULTS)
    .map((r) => ({ title: r.title, snippet: clip(r.snippet), source: domainOf(r.link), url: r.link }))
  return { answer: answer ? clip(answer) : null, results }
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")

/**
 * La web oficial entre los resultados: el dominio se parece al nombre del lugar
 * ("dupainetdesidees.com"). Solo esa: directorios y agregadores traen ruido o bloquean.
 */
export function pickReadableUrl(results: WebResult[], placeName: string | null): string | null {
  const name = placeName ? squash(placeName) : ""
  if (name.length < 4) return null
  const official = results.find((r) => {
    const base = squash(r.source.split(".").slice(0, -1).join("."))
    return base.length >= 4 && (name.includes(base) || base.includes(name))
  })
  return official?.url ?? null
}

const cache = new Map<string, { at: number; value: WebAnswer }>()

/** `country` en ISO-2 ("fr") para que los resultados sean del lugar del viaje. */
export async function webSearch(query: string, country: string | null): Promise<WebAnswer> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) throw new Error("Falta SERPER_API_KEY.")

  const key = `${query.toLowerCase().trim()}|${country}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const res = await fetch(SERPER_URL, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, hl: "es", num: 5, ...(country ? { gl: country } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const value = compactSerper((await res.json()) as SerperResponse)
  cache.set(key, { at: Date.now(), value })
  return value
}
