import "server-only"

import { z } from "zod"

import { callStructured } from "@/lib/llm/structured"

/**
 * Datos de guía de un lugar, una obra, un barrio o lo que salió en la foto. El modelo de
 * voz (mini) sabe poco y se equivoca en fechas; un modelo de texto más fuerte arma 2 o 3
 * datos seguros y el agente los cuenta con su voz.
 */

/** gpt-5.6-luna sin razonamiento: más preciso que el de voz y rápido (FACTS_EFFORT=low para más cuidado). */
const FACTS_MODEL = process.env.FACTS_MODEL ?? "gpt-5.6-luna"
const TIMEOUT_MS = 10_000
const MAX_FACTS = 3
/** Lo mismo sobre lo mismo no se vuelve a pagar en un rato. */
const CACHE_MS = 6 * 60 * 60 * 1000

const answerSchema = z.object({
  known: z.boolean(),
  facts: z.array(z.string()),
  anecdote: z.string().nullable(),
})

export type PlaceFacts = z.infer<typeof answerSchema>

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["known", "facts", "anecdote"],
  properties: {
    known: {
      type: "boolean",
      description: "true solo si conocés este lugar u obra puntual por su nombre. false si no te suena, aunque el nombre parezca de un lugar real: no deduzcas datos del nombre.",
    },
    facts: {
      type: "array",
      items: { type: "string" },
      description: `Hasta ${MAX_FACTS} datos concretos y verificables (quién, cuándo, para qué, una cifra), de máx. 25 palabras cada uno. Nada de generalidades como "es un ícono".`,
    },
    anecdote: { type: ["string", "null"], description: "Una anécdota conocida y verdadera, de máx. 30 palabras. null si no hay una segura." },
  },
}

const INSTRUCTIONS =
  "Sos un guía de turismo experto y riguroso. Das solo datos que sabés con certeza: fechas, autores, nombres, cifras. " +
  "Si dudás de un dato, no lo pongas. Si no conocés ese lugar u obra puntual, known es false y facts queda vacío: " +
  "nunca deduzcas qué es a partir del nombre. Escribí en castellano, frases cortas para decir en voz alta."

const cache = new Map<string, { at: number; facts: PlaceFacts }>()

export async function placeFacts(subject: string, question: string | null, city: string | null): Promise<PlaceFacts> {
  const key = `${subject}|${question ?? ""}|${city ?? ""}`.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.facts

  const text =
    `Sobre: ${subject}${city ? ` (el viajero está en ${city})` : ""}.\n` +
    (question ? `Lo que preguntó: "${question}". Que los datos respondan eso.` : "Quiere que le cuentes de esto como un guía.")

  const answer = answerSchema.parse(
    await callStructured({
      model: FACTS_MODEL,
      effort: process.env.FACTS_EFFORT === "low" ? "low" : "none",
      instructions: INSTRUCTIONS,
      maxOutputTokens: 600,
      timeoutMs: TIMEOUT_MS,
      content: [{ type: "input_text", text }],
      schemaName: "datos",
      schema: JSON_SCHEMA,
    })
  )
  const facts = { ...answer, facts: answer.facts.slice(0, MAX_FACTS) }
  cache.set(key, { at: Date.now(), facts })
  return facts
}
