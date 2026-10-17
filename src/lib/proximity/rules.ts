import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo"
import { PROXIMITY } from "@/lib/tuning"

/**
 * Reglas del motor de avisos por cercanía (C-6), sin base ni modelos: qué se puede
 * avisar con esta posición. Lo que va con los gustos lo decide Jev aparte (`interest.ts`).
 */

// Umbrales: se cambian en src/lib/tuning.ts (o por variable de entorno).
export const NOTIFY_RADIUS_METERS = PROXIMITY.notifyRadiusMeters
export const INTEREST_RADIUS_METERS = PROXIMITY.interestRadiusMeters
export const LOCKED_GUARD_MINUTES = PROXIMITY.lockedGuardMinutes

export type CandidateKind = "local_tip" | "itinerary" | "interest"

export type Candidate = LatLng & {
  kind: CandidateKind
  placeId: string
  name: string
  /** local_tip: quién lo recomendó. */
  recommender?: string | null
  /** itinerary: a qué hora está en el plan. */
  startsAt?: string
  /** interest: categoría y gustos que coinciden, para el texto. */
  category?: string
  matchedTags?: string[]
}

export type NextLocked = { placeId: string | null; startsAt: string }

export type Situation = {
  position: LatLng
  now: Date
  /** Lugares de los que ya se avisó (nunca se repite). */
  notifiedPlaceIds: ReadonlySet<string>
  /** Cuándo fue el último aviso: entre aviso y aviso hay una pausa. */
  lastNotifiedAt: Date | null
  cooldownMs: number
  nextLocked: NextLocked | null
}

const PRIORITY: Record<CandidateKind, number> = { local_tip: 0, itinerary: 1, interest: 2 }

export function inCooldown(s: Pick<Situation, "lastNotifiedAt" | "cooldownMs" | "now">): boolean {
  return s.lastNotifiedAt !== null && s.now.getTime() - s.lastNotifiedAt.getTime() < s.cooldownMs
}

/** Si se viene una reserva, no distraer: solo vale avisar de la reserva misma. */
function blockedByLocked(c: Candidate, s: Situation): boolean {
  if (!s.nextLocked) return false
  const minutes = (new Date(s.nextLocked.startsAt).getTime() - s.now.getTime()) / 60_000
  return minutes >= 0 && minutes < LOCKED_GUARD_MINUTES && c.placeId !== s.nextLocked.placeId
}

/** Candidatos que se pueden avisar ahora, por prioridad y después por cercanía. */
export function eligible(candidates: readonly Candidate[], s: Situation): Candidate[] {
  if (inCooldown(s)) return []
  return candidates
    .filter((c) => !s.notifiedPlaceIds.has(c.placeId))
    .filter((c) => distanceMeters(s.position, c) <= (c.kind === "interest" ? INTEREST_RADIUS_METERS : NOTIFY_RADIUS_METERS))
    .filter((c) => !blockedByLocked(c, s))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || distanceMeters(s.position, a) - distanceMeters(s.position, b))
}

/** Lo que se avisa sin preguntarle a nadie: recomendaciones de residentes y el plan. */
export function pickRuleCandidate(candidates: readonly Candidate[], s: Situation): Candidate | null {
  return eligible(candidates, s).find((c) => c.kind !== "interest") ?? null
}

const timeOf = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso))

/** Texto del aviso, con plantilla (lo muestra B-6 y lo dice el agente en A-6). */
export function reasonText(c: Candidate, position: LatLng, timeZone: string): string {
  const min = walkMinutes(position, c)
  const near = `Estás a ${min} min de ${c.name}`
  switch (c.kind) {
    case "local_tip":
      return `${near}, que te ${c.recommender ? `recomendó ${c.recommender}` : "recomendaron"}.`
    case "itinerary":
      return c.startsAt ? `${near}, lo tenés en el plan a las ${timeOf(c.startsAt, timeZone)}.` : `${near}, lo tenés en el plan.`
    case "interest":
      return c.matchedTags?.length ? `${near}, va con lo que te gusta (${c.matchedTags.join(", ")}).` : `${near}.`
  }
}
