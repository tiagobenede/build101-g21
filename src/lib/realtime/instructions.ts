import type { ItineraryItem, TravelerContext } from "@/lib/data/session"

import { zonedDateKey } from "@/lib/time/zoned"

import { MAX_ITINERARY_IN_CONTEXT, MAX_PLACES_IN_CONTEXT } from "./config"

interface InstructionsInput {
  ctx: Pick<
    TravelerContext,
    "firstName" | "interests" | "travelStyle" | "locationLabel" | "nearby" | "itinerary" | "constraints" | "profileSummary"
  > &
  Partial<Pick<TravelerContext, "companions">
  >
  nextCommitment: ItineraryItem | null
  /** Una línea de Open-Meteo, o null si no se pudo traer. */
  weather: string | null
  /** Calle y barrio (reverse geocoding), o null si no se pudo traer. */
  address?: string | null
  /** Lo que le recomendaron personas locales en el traductor (lo más nuevo primero). */
  localTips?: LocalTipLine[]
  now: Date
  timeZone: string
}

export type LocalTipLine = { placeName: string; what: string; why: string | null; recommender: string | null }

/** "Te recomendaron (gente del lugar, con el traductor): …" o null si no hay. */
export function localTipsLine(tips: LocalTipLine[]): string | null {
  if (tips.length === 0) return null
  const items = tips.map((t) => {
    const who = t.recommender ? `, según ${t.recommender}` : ""
    return `${t.placeName}: ${t.what.replace(/\.$/, "")}${t.why ? ` (${t.why.replace(/\.$/, "")})` : ""}${who}`
  })
  return `Te recomendaron gente del lugar, con el traductor: ${items.join("; ")}. Si viene al caso, retomalo ("lo que te dijo…").`
}

const formatTime = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(date)


/** Referencia corta de una actividad para `edit_itinerary` (los primeros 8 caracteres del id). */
export const itemRef = (id: string) => id.slice(0, 8)

const STATUS_NOTE: Record<ItineraryItem["status"], string> = {
  planned: "",
  in_progress: " (en curso)",
  done: " (hecho)",
  skipped: " (saltado)",
}

/**
 * El plan de hoy, una línea por actividad con su ref, estado y si es reserva. Lo usan
 * las instrucciones y la respuesta de `edit_itinerary` (así el agente ve el plan nuevo).
 */
/** Nombres de quienes viajan con el viajero, por id (para "sumó Sofía"). */
export type CompanionNames = ReadonlyMap<string, string>

export function formatTodayPlan(
  itinerary: ItineraryItem[],
  now: Date,
  timeZone: string,
  companionNames: CompanionNames = new Map()
): string {
  const today = zonedDateKey(now, timeZone)
  const items = itinerary
    .filter((i) => zonedDateKey(new Date(i.starts_at), timeZone) === today)
    .slice(0, MAX_ITINERARY_IN_CONTEXT)
  if (items.length === 0) return "Plan de hoy: nada agendado."
  const lines = items.map((i) => {
    const start = new Date(i.starts_at)
    const end = i.ends_at ? new Date(i.ends_at) : null
    const range = `${formatTime(start, timeZone)}${end ? `–${formatTime(end, timeZone)}` : ""}`
    const past = i.status === "planned" && (end ?? start) < now ? " (ya pasó)" : ""
    const by = i.created_by ? companionNames.get(i.created_by) : undefined
    return `- [${itemRef(i.id)}] ${range} ${i.title}${STATUS_NOTE[i.status]}${past}${i.locked ? " (reserva)" : ""}${by ? ` (sumó ${by})` : ""}`
  })
  return `Plan de hoy:\n${lines.join("\n")}`
}

/** Quienes viajan juntos y lo que no negocian, o null si viaja solo. */
export function companionsLine(companions: TravelerContext["companions"]): string | null {
  if (companions.length === 0) return null
  const people = companions.map((c) => {
    const limits = [...c.dietary, c.mobility ? `movilidad: ${c.mobility}` : null].filter(Boolean)
    return limits.length > 0 ? `${c.firstName} (${limits.join(", ")})` : c.firstName
  })
  return `Viaje compartido con ${people.join(", ")}: cada uno habla con vos desde su teléfono y el plan es uno solo. Lo no negociable de cualquiera del grupo se respeta en lo que recomiendes. Si alguien sumó o cambió algo del plan, podés mencionarlo ("Sofía sumó…").`
}

/** Restricciones no negociables, o null si no cargó ninguna. */
function constraintsLine({ dietary, mobility, dailyBudget, pace, schedule }: TravelerContext["constraints"]): string | null {
  const hard = [
    dietary.length > 0 ? `dieta ${dietary.join(", ")}` : null,
    mobility ? `movilidad: ${mobility}` : null,
    dailyBudget !== null ? `presupuesto ${dailyBudget} € por día` : null,
  ].filter(Boolean)
  const soft = [pace ? `ritmo ${pace}` : null, schedule].filter(Boolean)
  if (hard.length === 0 && soft.length === 0) return null
  return [hard.length > 0 ? `No negociable: ${hard.join("; ")}.` : null, soft.length > 0 ? `Prefiere: ${soft.join(", ")}.` : null]
    .filter(Boolean)
    .join(" ")
}

/**
 * "Place des Vosges (calle: Place des Vosges, Quartier de l'Arsenal, …)." El lugar
 * cercano solo dice "París" si no hay nada a 300 m; la calle y el barrio le dan al
 * agente dónde está parado de verdad.
 */
export function locationLine(label: string, address: string | null): string {
  if (!address) return `${label}.`
  // "París" (sin lugar cerca) o "Place des Vosges" ya están dentro de la dirección.
  if (address.includes(label)) return `${address}.`
  return `cerca de ${label} (está en ${address}).`
}

/**
 * Pedido de saludo al abrir la llamada, con el nombre escrito: el modelo mini no lo
 * toma de las instrucciones y preguntaba "¿cómo te llamás?".
 */
export const greetingPrompt = (firstName: string) =>
  `Empezó la llamada. Saludá a ${firstName} por su nombre con una sola frase de no más de 12 palabras, como alguien que la acompaña en el viaje. Como mucho un dato del momento (el clima o dónde está); no hables del plan ni ofrezcas opciones todavía. No le preguntes cómo se llama ni cuánto tiempo tiene.`

/**
 * Instrucciones compactas: todo el contexto va acá (no por tools) para que se
 * cachee entre turnos y cada respuesta lea pocos tokens nuevos.
 */
export function buildInstructions({ ctx, nextCommitment, weather, address = null, localTips = [], now, timeZone }: InstructionsInput): string {
  const companions = ctx.companions ?? []
  const places = ctx.nearby
    .slice(0, MAX_PLACES_IN_CONTEXT)
    .map((p) => `- ${p.name} (${p.category}; ${p.tags.join(", ")}; ${p.walkMinutes} min a pie; visita ~${p.typical_visit_minutes} min)`)
    .join("\n")

  const commitment = nextCommitment
    ? `Próximo compromiso: "${nextCommitment.title}" a las ${formatTime(new Date(nextCommitment.starts_at), timeZone)}.`
    : "No tiene compromisos próximos hoy."

  return `Sos Rumbo, guía de viaje por voz. Hablás con ${ctx.firstName} en español rioplatense, cálido y directo: usá vos, nunca tú (decí "con vos", no "contigo").
Respondé en 1 o 2 oraciones (máx. 40 palabras). Nada de listas ni disclaimers. Charlá natural, como alguien que la acompaña: no hagas preguntas de formulario. Si falta un dato clave, hacé una sola pregunta corta.

Hora local: ${formatTime(now, timeZone)}. Ubicación: ${locationLine(ctx.locationLabel, address)}${weather ? ` Clima: ${weather}` : ""}
Gustos (en orden de importancia): ${ctx.interests.join(", ")}.${ctx.travelStyle ? ` Estilo: ${ctx.travelStyle}.` : ""}
${[
  constraintsLine(ctx.constraints),
  ctx.profileSummary ? `Lo que aprendiste de ${ctx.firstName}: ${ctx.profileSummary}` : null,
  localTipsLine(localTips),
  companionsLine(companions),
]
  .filter(Boolean)
  .join("\n")}
${commitment}
${formatTodayPlan(ctx.itinerary, now, timeZone, new Map(companions.map((c) => [c.userId, c.firstName])))}

Lugares cerca (para responder preguntas; nombralos con el nombre exacto):
${places}

Pantalla: lo que devuelven recommend_nearby, search_places, search_events y get_place aparece en la pantalla del viajero en ese mismo momento y en ese orden. Hablá de esos lugares (el primero es el destacado) y nunca digas que no encontraste nada si el tool devolvió lugares; si no devolvió ninguno, la pantalla queda vacía. Para recomendar o mostrar un lugar usá siempre uno de esos tools, aunque esté en la lista de cerca, así lo que decís y lo que se ve coinciden.
No preguntes cuánto tiempo tiene: si no lo dice, recommend_nearby usa el próximo compromiso del plan. Cuando pida qué hacer o adónde ir, llamá a recommend_nearby sin anunciarlo y recomendá el primer lugar que devuelva (mencioná otro solo si te lo pide); decí cuántos minutos camina y cuánto puede quedarse. Si tiene un compromiso, que llegue con margen. Si no devuelve lugares, decíselo y preguntá qué le gustaría hacer.
Si busca algo puntual que no está en la lista (un tipo de lugar o uno por su nombre), usá search_places. Mientras buscás la charla sigue: si el resultado llega con "late": true, retomalo con una frase como "ya tengo lo que buscabas".
Si va a llover, preferí lugares cubiertos y avisale. No leas el plan en voz alta: usalo para que lo que recomiendes no se superponga.
Lo no negociable se respeta siempre: no recomiendes nada que lo contradiga.
Para cambiar el plan (agregar, mover, sacar, marcar hecho o saltado, deshacer) usá edit_itinerary con la ref entre corchetes y confirmá en una frase. Las reservas no se tocan.
Si cuenta algo de sí que sirve para después (qué come, qué evita, qué le gusta, cómo se mueve), guardalo con remember sin anunciarlo. Para detalles de un lugar (horarios, si está abierto) usá get_place. Si pregunta qué hay para hacer con horario (un concierto, una expo, algo esta noche o mañana) usá search_events: recomendá uno con la hora y cuánto camina, el nombre dicho en castellano, y ofrecé sumarlo al plan. Para lo que no sabés (el menú, si tienen algo, precios) usá web_search y decí de dónde lo sacaste; nunca inventes un menú.`
}
