/**
 * Lo que el agente de onboarding anota mientras charla (tool `capture`) y lo que el
 * viajero confirma al final. Compartido por el navegador (resuelve los tools) y el
 * server (valida y guarda).
 */
import { z } from "zod"

import { DIETS, INTEREST_TAGS } from "@/lib/agent/rank"

import { LAST_QUESTION } from "./questions"

export const insightSchema = z.object({
  question: z.number().int().min(1).max(LAST_QUESTION).describe("Número de la pregunta en la que salió."),
  title: z.string().trim().min(2).max(48).describe("Titular de 2 a 5 palabras para la pantalla: 'Fan de los autos clásicos'."),
  summary: z.string().trim().min(2).max(110).describe("Una línea que lo resume para que lo confirme."),
  detail: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .describe("Descripción completa para el guía del viaje, en tercera persona y con los matices que contó."),
  why: z
    .string()
    .trim()
    .min(5)
    .max(300)
    .describe("Por qué lo anotás: lo que dijo (casi textual) y cómo debería usarse al recomendar."),
  kind: z.enum(["preference", "constraint"]).describe("constraint = no negociable (dieta, movilidad, alergia)."),
  avoid: z.boolean().describe("true si es algo que evita o no le gusta."),
  interest: z.enum(INTEREST_TAGS).nullable().describe("El gusto que corresponde, si hay uno. null si no."),
  diet: z.enum(DIETS).nullable().describe("La dieta, si es una restricción de comida. null si no."),
})

export type Insight = z.infer<typeof insightSchema>

export const captureSchema = z.object({
  keywords: z
    .array(z.string().trim().min(2).max(24))
    .max(4)
    .describe("1 a 3 palabras clave de lo que acaba de decir, como las diría ('autos', 'curioso', 'madrugador')."),
  insights: z.array(insightSchema).max(4).describe("Lo nuevo que aprendiste en este turno. Vacío si solo hay palabras clave."),
  pace: z.enum(["tranquilo", "intenso"]).nullable().describe("Su ritmo, si quedó claro. null si no."),
  schedule: z.enum(["madrugador", "noctámbulo"]).nullable().describe("Si es madrugador o noctámbulo. null si no."),
  daily_budget: z.number().int().min(0).max(100_000).nullable().describe("Presupuesto por día en euros, si lo dijo. null si no."),
  mobility: z.string().trim().max(80).nullable().describe("Limitación para moverse ('sin escaleras'). null si no tiene o no dijo."),
})

export type Capture = z.infer<typeof captureSchema>

export const nextQuestionSchema = z.object({})

/** Lo que saca el modelo de texto de la charla entera, al final (sin palabras clave). */
export const extractionSchema = captureSchema.omit({ keywords: true }).extend({
  insights: z.array(insightSchema).max(15),
})

export type Extraction = z.infer<typeof extractionSchema>

/** Una frase de la charla: quién habló, en qué pregunta y qué dijo (transcripción). */
export const transcriptTurnSchema = z.object({
  question: z.number().int().min(1).max(LAST_QUESTION),
  role: z.enum(["user", "agent"]),
  text: z.string().trim().min(1).max(600),
})

export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>

export const transcriptSchema = z.array(transcriptTurnSchema).min(1).max(80)

/** Palabras clave de una respuesta (las burbujas). */
export const keywordsSchema = z.object({ keywords: z.array(z.string().trim().min(2).max(24)).max(3) })

/** Lo que el viajero confirma al final y se guarda en el perfil. */
export const onboardingResultSchema = z.object({
  insights: z.array(insightSchema).max(30),
  pace: captureSchema.shape.pace,
  schedule: captureSchema.shape.schedule,
  dailyBudget: captureSchema.shape.daily_budget,
  mobility: captureSchema.shape.mobility,
})

export type OnboardingResult = z.infer<typeof onboardingResultSchema>

const toToolParameters = (schema: z.ZodType) => {
  const parameters: Record<string, unknown> = { ...z.toJSONSchema(schema) }
  delete parameters.$schema
  return parameters
}

/**
 * Único tool del agente de onboarding (lo resuelve el navegador): pasar de pregunta antes de
 * tiempo. Sin argumentos, para que no demore la respuesta. Lo que aprende lo saca después un
 * modelo de texto de la transcripción.
 */
export const ONBOARDING_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    name: "next_question",
    description:
      "Pasa a la siguiente pregunta (cambia el titular de la pantalla). Llamalo apenas la respuesta alcanza, sin anunciarlo. Devuelve la pregunta nueva, o done si era la última.",
    parameters: toToolParameters(nextQuestionSchema),
  },
]

/** Realtime a veces omite los campos que aceptan null: se completan antes de validar. */
export function fillNulls(schema: z.ZodObject, args: unknown): unknown {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return args
  const filled: Record<string, unknown> = { ...args }
  for (const [key, field] of Object.entries(schema.shape)) {
    if (filled[key] === undefined && (field as z.ZodType).safeParse(null).success) filled[key] = null
  }
  return filled
}
