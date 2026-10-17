import "server-only"

/**
 * Una llamada a la Responses API de OpenAI con salida estructurada (JSON Schema strict).
 * La usan visión (C-3) y la extracción de recomendaciones (C-5).
 */

const RESPONSES_URL = "https://api.openai.com/v1/responses"

export type StructuredRequest = {
  model: string
  /** gpt-5.6-luna acepta none, low, medium, high, xhigh y max (no "minimal"). */
  effort: "none" | "low" | "medium"
  /** Lo que va como mensaje del usuario: texto y, opcionalmente, imágenes. */
  content: ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" | "high" })[]
  instructions?: string
  schemaName: string
  schema: object
  maxOutputTokens: number
  timeoutMs: number
}

/** Devuelve el JSON que respondió el modelo, sin validar (validarlo con zod). */
export async function callStructured(req: StructuredRequest): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY.")

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: req.model,
      reasoning: { effort: req.effort },
      max_output_tokens: req.maxOutputTokens,
      ...(req.instructions ? { instructions: req.instructions } : {}),
      input: [{ role: "user", content: req.content }],
      text: { format: { type: "json_schema", name: req.schemaName, strict: true, schema: req.schema } },
    }),
    signal: AbortSignal.timeout(req.timeoutMs),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const body = (await res.json()) as { status?: string; output?: { content?: { type: string; text?: string }[] }[] }
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text
  if (!text) throw new Error(`OpenAI no devolvió texto (status ${body.status ?? "?"}).`)
  return JSON.parse(text)
}
