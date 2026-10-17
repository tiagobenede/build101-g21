import "server-only"

import { z } from "zod"

import type { JevChoice } from "./choose"

/**
 * Jev (TypeSafe): modelo de decisión. Le preguntamos "¿cuál de estos lugares es el
 * de la foto?" con una pregunta `choice`. Las imágenes son experimentales en Jev y
 * van detrás del header `TypeSafe-Danger-Zone-Images`. Docs: https://docs.typesafe.ai/go/images
 *
 * Límites de Jev: PNG o JPEG, cada lado entre 280 y 1568 px (no las achica).
 */

const SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone"
const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest"
const TIMEOUT_MS = 6_000
const QUESTION = "lugar"
const PHOTO_REF = "foto-del-viajero"

const responseSchema = z.object({
  answers: z.object({
    [QUESTION]: z.object({ choice: z.string(), confidence: z.number().min(0).max(1) }),
  }),
})

export type Photo = { bytes: Uint8Array<ArrayBuffer>; mime: "image/jpeg" | "image/png" }

export async function askJev(photo: Photo, whereLabel: string, criteria: Record<string, string>): Promise<JevChoice> {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) throw new Error("Falta TYPESAFE_API_KEY.")

  const request = {
    model: JEV_MODEL,
    state: { foto: PHOTO_REF, ubicacion: `El viajero está cerca de ${whereLabel}.` },
    assets: { [PHOTO_REF]: { type: "image", part: "foto" } },
    questions: {
      [QUESTION]: {
        type: "choice",
        instructions: "¿Qué lugar se ve en `foto`? El viajero sacó la foto desde donde está.",
        criteria,
      },
    },
  }

  const form = new FormData()
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }))
  form.append("foto", new Blob([photo.bytes], { type: photo.mime }), photo.mime === "image/png" ? "foto.png" : "foto.jpg")

  const res = await fetch(SYSTEM_ONE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "TypeSafe-Danger-Zone-Images": "true" },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return responseSchema.parse(await res.json()).answers[QUESTION]
}
