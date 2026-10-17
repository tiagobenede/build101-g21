import type { ItineraryItem, TravelerContext } from "@/lib/data/session"

import { MAX_PLACES_IN_CONTEXT } from "./config"

interface InstructionsInput {
  ctx: Pick<TravelerContext, "firstName" | "interests" | "travelStyle" | "locationLabel" | "nearby">
  nextCommitment: ItineraryItem | null
  now: Date
  timeZone: string
}

const formatTime = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(date)

/**
 * Instrucciones compactas: todo el contexto va acá (no por tools) para que se
 * cachee entre turnos y cada respuesta lea pocos tokens nuevos.
 */
export function buildInstructions({ ctx, nextCommitment, now, timeZone }: InstructionsInput): string {
  const places = ctx.nearby
    .slice(0, MAX_PLACES_IN_CONTEXT)
    .map((p) => `- ${p.name} (${p.category}; ${p.tags.join(", ")}; ${p.walkMinutes} min a pie; visita ~${p.typical_visit_minutes} min)`)
    .join("\n")

  const commitment = nextCommitment
    ? `Próximo compromiso: "${nextCommitment.title}" a las ${formatTime(new Date(nextCommitment.starts_at), timeZone)}.`
    : "No tiene compromisos próximos hoy."

  return `Sos Rumbo, guía de viaje por voz. Hablás con ${ctx.firstName} en español rioplatense, cálido y directo.
Respondé en 1 o 2 oraciones (máx. 40 palabras). Nada de listas ni disclaimers. Si falta un dato clave, hacé una sola pregunta corta.

Hora local: ${formatTime(now, timeZone)}. Ubicación: ${ctx.locationLabel}.
Gustos (en orden de importancia): ${ctx.interests.join(", ")}.${ctx.travelStyle ? ` Estilo: ${ctx.travelStyle}.` : ""}
${commitment}

Lugares cerca (recomendá solo de esta lista):
${places}

Cuando diga cuánto tiempo tiene, recomendá un lugar que entre en ese tiempo (ida a pie + visita) y que vaya con sus gustos; decí cuántos minutos camina y cuánto puede quedarse. Si tiene un compromiso, que llegue con margen.`
}
