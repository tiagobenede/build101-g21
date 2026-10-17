import "server-only"

import type { z } from "zod"

import { genUiProvider } from "@/lib/genui/provider"

import { ONBOARDING_QUESTIONS } from "./questions"
import { extractionSchema, keywordsSchema, type Extraction, type TranscriptTurn } from "./schema"

const TIMEOUT_MS = 12_000

/** Pide JSON al modelo de texto rápido (el mismo de la UI generativa) y lo valida con zod. */
async function jsonCompletion<T>(schema: z.ZodType<T>, system: string, user: string, maxTokens: number): Promise<T> {
  const provider = genUiProvider()
  if (!provider) throw new Error("Falta OPENAI_API_KEY.")
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${provider.name} respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const parsed = schema.safeParse(JSON.parse(body.choices?.[0]?.message?.content ?? "null"))
  if (!parsed.success) throw new Error(`JSON inválido: ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

const KEYWORDS_SYSTEM = `Sacás palabras clave de lo que dice un viajero cuando le preguntan por sus gustos de viaje.
Devolvé JSON {"keywords": [...]} con 0 a 3 palabras clave cortas (1 o 2 palabras, en minúscula, en español, como las diría: "autos", "curioso", "madrugador", "sin gluten").
Solo cosas que sirven para recomendarle lugares o planes. Si no dijo nada útil, {"keywords": []}.`

/** Palabras clave de una respuesta del viajero (las burbujas de la pantalla). */
export async function extractKeywords(question: number, text: string): Promise<string[]> {
  const title = ONBOARDING_QUESTIONS[question - 1]?.title ?? ""
  const { keywords } = await jsonCompletion(keywordsSchema, KEYWORDS_SYSTEM, `Pregunta: ${title}\nRespuesta: ${text}`, 80)
  return keywords
}

const INSIGHTS_SYSTEM = `Leés la primera charla entre Polo (un guía de viaje por voz) y un viajero, y armás su perfil.
Devolvé JSON con esta forma:
{"insights": [{"question": n, "title": "...", "summary": "...", "detail": "...", "why": "...", "kind": "preference"|"constraint", "avoid": bool, "interest": tag|null, "diet": dieta|null}], "pace": "tranquilo"|"intenso"|null, "schedule": "madrugador"|"noctámbulo"|null, "daily_budget": número en euros|null, "mobility": texto|null}
- Un insight por cosa útil que contó (máximo 15). question = número de la pregunta donde salió.
- title: titular de 2 a 5 palabras ("Fan de los autos clásicos"). summary: una línea (máx. 100 caracteres).
- detail: descripción completa en tercera persona, con los matices (máx. 280 caracteres). why: qué dijo (casi textual) y cómo usarlo al recomendar (máx. 280).
- kind "constraint" solo para lo no negociable (dieta, alergia, movilidad). avoid true si es algo que evita.
- interest, uno de: autos, arte, diseño, arquitectura, café, historia, libros, comida, mercados, parques, compras, ciencia; o null.
- diet, una de: vegetariano, vegano, sin gluten, sin lactosa, halal, kosher; o null.
- Nada que no haya dicho el viajero. Lo que dice el guía no cuenta como dato.`

/** Perfil completo a partir de la transcripción de la charla. */
export async function extractInsights(turns: TranscriptTurn[]): Promise<Extraction> {
  const text = ONBOARDING_QUESTIONS.map((q) => {
    const lines = turns.filter((t) => t.question === q.id).map((t) => `${t.role === "user" ? "Viajero" : "Polo"}: ${t.text}`)
    return lines.length > 0 ? `Pregunta ${q.id} — ${q.title}\n${lines.join("\n")}` : null
  })
    .filter(Boolean)
    .join("\n\n")
  return jsonCompletion(extractionSchema, INSIGHTS_SYSTEM, text, 3_000)
}
