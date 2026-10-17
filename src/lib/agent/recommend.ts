/**
 * Motor de respuestas simulado del agente.
 *
 * Reglas simples sobre gustos + ubicación + tiempo disponible. La idea es
 * reemplazarlo por el LLM real (ElevenLabs Agent + Claude) manteniendo el
 * mismo contrato: (mensaje, contexto) -> AgentReply.
 */
import { walkMinutes } from "@/lib/geo"

import type { AgentContext, AgentReply, Place, Recommendation } from "./types"

const MIN_STAY_MINUTES = 10
const COMMITMENT_BUFFER_MINUTES = 15
const DEFAULT_AVAILABLE_MINUTES = 60
const MAX_ALTERNATIVES = 2

const TAG_PHRASES: Record<string, string> = {
  autos: "los autos",
  arte: "el arte",
  diseño: "el diseño",
  arquitectura: "la arquitectura",
  café: "el café",
  historia: "la historia",
  libros: "los libros",
  comida: "la comida",
  mercados: "los mercados",
  parques: "los parques",
  compras: "las compras",
  ciencia: "la ciencia",
}

/** Palabras del mensaje que indican qué quiere hacer ahora. */
const INTENT_KEYWORDS: Record<string, RegExp> = {
  comida: /\b(hambre|comer|comida|almorzar|cenar|almuerzo|cena|merienda)\b/,
  café: /\b(caf[eé]|cafecito|cortado)\b/,
  autos: /\b(autos?|coches?|carros?|motores?|fierros)\b/,
  arte: /\b(arte|museos?|pintura|cuadros?)\b/,
  parques: /\b(parques?|plaza|aire libre|verde|caminar)\b/,
  libros: /\b(libros?|librer[ií]a)\b/,
  arquitectura: /\b(arquitectura|edificios?|iglesias?|catedral)\b/,
}

const GREETING = /^\s*(hola|buenas|buen d[ií]a|hey|qu[eé] tal)[\s!.,¡]*$/

const NUMBER_WORDS: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3 }

const normalize = (text: string) => text.toLowerCase().normalize("NFC")

/** Extrae cuántos minutos libres dice tener el usuario. null si no lo dice. */
export function parseAvailableMinutes(text: string): number | null {
  const t = normalize(text)

  if (/media hora/.test(t)) return 30

  const hours = t.match(/(\d+|una|un|dos|tres)?\s*horas?(\s*y\s*media)?/)
  if (hours && (hours[1] || hours[2] || /\bhora\b/.test(t))) {
    const base = hours[1] ? (NUMBER_WORDS[hours[1]] ?? Number(hours[1])) : 1
    return base * 60 + (hours[2] ? 30 : 0)
  }

  const minutes = t.match(/(\d+)\s*(min|minutos?)\b/)
  return minutes ? Number(minutes[1]) : null
}

function detectRequestedTags(text: string): string[] {
  const t = normalize(text)
  return Object.entries(INTENT_KEYWORDS)
    .filter(([, re]) => re.test(t))
    .map(([tag]) => tag)
}

function minutesUntil(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000)
}

function resolveAvailableMinutes(message: string, ctx: AgentContext): number {
  const stated = parseAvailableMinutes(message)
  if (stated !== null) return stated
  if (ctx.nextCommitment) {
    return Math.max(0, minutesUntil(ctx.now, ctx.nextCommitment.startsAt) - COMMITMENT_BUFFER_MINUTES)
  }
  return DEFAULT_AVAILABLE_MINUTES
}

/** Peso de cada tag: el primer gusto cargado pesa más. Tags pedidos en el mensaje pesan igual. */
function tagWeights(wanted: string[], ranked: boolean): Map<string, number> {
  return new Map(wanted.map((tag, i) => [tag, ranked ? 2 ** (wanted.length - i) : 3]))
}

function scorePlace(place: Place, weights: Map<string, number>, walk: number): { score: number; matched: string[] } {
  const matched = place.tags.filter((t) => weights.has(t))
  const interestScore = matched.reduce((sum, t) => sum + (weights.get(t) ?? 0), 0)
  return { score: interestScore + (place.rating ?? 4) - walk / 10, matched }
}

function rankPlaces(ctx: AgentContext, weights: Map<string, number>, available: number): Recommendation[] {
  return ctx.places
    .map((place) => {
      const walk = walkMinutes(ctx.location, place)
      const stay = Math.min(place.typical_visit_minutes, available - walk)
      const { score, matched } = scorePlace(place, weights, walk)
      const penalty = ctx.alreadyRecommended.includes(place.id) ? 5 : 0
      return { place, walkMinutes: walk, stayMinutes: stay, matchedTags: matched, score: score - penalty }
    })
    .filter((r) => r.stayMinutes >= MIN_STAY_MINUTES && r.matchedTags.length > 0)
    .sort((a, b) => b.score - a.score)
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(date)
}

function joinTags(tags: string[]): string {
  const phrases = tags.map((t) => TAG_PHRASES[t] ?? t)
  return phrases.length <= 1 ? (phrases[0] ?? "") : `${phrases.slice(0, -1).join(", ")} y ${phrases.at(-1)}`
}

const minutes = (n: number) => `${n} ${n === 1 ? "minuto" : "minutos"}`

function greet(ctx: AgentContext): AgentReply {
  return {
    text:
      `¡Hola ${ctx.firstName}! Estás cerca de ${ctx.locationLabel}. ` +
      `Sé que sos fan de ${joinTags(ctx.interests)}. ` +
      `Contame cuánto tiempo tenés y te digo qué podés hacer cerca.`,
    recommendations: [],
    availableMinutes: null,
  }
}

function commitmentNote(ctx: AgentContext): string {
  if (!ctx.nextCommitment) return ""
  const at = formatTime(ctx.nextCommitment.startsAt, ctx.timeZone)
  return ` Ojo, a las ${at} tenés "${ctx.nextCommitment.title}", así que llegás bien.`
}

export function replyTo(message: string, ctx: AgentContext): AgentReply {
  if (GREETING.test(normalize(message))) return greet(ctx)

  const available = resolveAvailableMinutes(message, ctx)
  const requested = detectRequestedTags(message)
  const wanted = requested.length > 0 ? requested : ctx.interests
  const ranked = rankPlaces(ctx, tagWeights(wanted, requested.length === 0), available)

  if (ranked.length === 0) {
    return {
      text:
        available < MIN_STAY_MINUTES * 2
          ? `Con ${available} minutos es poco tiempo para moverte. Aprovechá para tomar algo cerca y en cuanto tengas un rato más te armo un plan.`
          : `No encontré nada de ${joinTags(wanted)} que te entre en ${available} minutos. ¿Querés que busque otra cosa?`,
      recommendations: [],
      availableMinutes: available,
    }
  }

  const [best, ...rest] = ranked
  const alternatives = rest.slice(0, MAX_ALTERNATIVES)
  const why = requested.length > 0 ? `Para ${joinTags(best.matchedTags)}` : `Como sos fan de ${joinTags(best.matchedTags)}`
  const altText =
    alternatives.length > 0
      ? ` Si preferís otra cosa, ${alternatives[0].place.name} está a ${minutes(alternatives[0].walkMinutes)}.`
      : ""

  return {
    text:
      `${why}, a ${minutes(best.walkMinutes)} caminando tenés ${best.place.name}. ` +
      `${best.place.description ?? ""} ` +
      `Con ${minutes(available)} te da para unos ${minutes(best.stayMinutes)} ahí.` +
      commitmentNote(ctx) +
      altText,
    recommendations: [best, ...alternatives],
    availableMinutes: available,
  }
}
