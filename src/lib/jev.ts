import "server-only"

import { z } from "zod"

/**
 * Jev (TypeSafe): modelo de decisión. No escribe texto: responde preguntas tipadas.
 * Usamos preguntas `choice` (elegir una opción) con una opción "ninguno".
 * Docs: https://docs.typesafe.ai/api · imágenes: https://docs.typesafe.ai/go/images
 */

const SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone"
const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest"
const QUESTION = "pregunta"

const responseSchema = z.object({
  answers: z.object({
    [QUESTION]: z.object({
      choice: z.string(),
      confidence: z.number().min(0).max(1),
      probabilities: z.record(z.string(), z.number()),
    }),
  }),
})

export type JevChoice = { choice: string; confidence: number; probabilities?: Record<string, number> }

/** Imagen adjunta (experimental en Jev: va detrás del header `TypeSafe-Danger-Zone-Images`). */
export type JevImage = { bytes: Uint8Array<ArrayBuffer>; mime: "image/jpeg" | "image/png" }

export type ChoiceRequest = {
  /** Datos sobre los que decide. Una imagen se referencia con el string `ref` de `image`. */
  state: Record<string, unknown>
  instructions: string
  /** Opción → descripción. */
  criteria: Record<string, string>
  image?: { ref: string; photo: JevImage }
  timeoutMs: number
}

export async function askJevChoice(req: ChoiceRequest): Promise<JevChoice> {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) throw new Error("Falta TYPESAFE_API_KEY.")

  const request = {
    model: JEV_MODEL,
    state: req.state,
    ...(req.image ? { assets: { [req.image.ref]: { type: "image", part: "imagen" } } } : {}),
    questions: { [QUESTION]: { type: "choice", instructions: req.instructions, criteria: req.criteria } },
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
  let body: BodyInit
  if (req.image) {
    // Multipart: el JSON en `request` y la imagen como archivo (recomendado por la doc).
    const { photo } = req.image
    const form = new FormData()
    form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }))
    form.append("imagen", new Blob([photo.bytes], { type: photo.mime }), photo.mime === "image/png" ? "foto.png" : "foto.jpg")
    headers["TypeSafe-Danger-Zone-Images"] = "true"
    body = form
  } else {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(request)
  }

  const res = await fetch(SYSTEM_ONE_URL, { method: "POST", headers, body, signal: AbortSignal.timeout(req.timeoutMs) })
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return responseSchema.parse(await res.json()).answers[QUESTION]
}
