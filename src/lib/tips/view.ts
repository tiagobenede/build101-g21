/**
 * Recomendación de una persona local tal como la muestra la UI (cards del traductor y
 * "Te recomendaron" en la home). Sale de `local_tips` + el lugar anclado.
 */
export type TipStatus = "pending" | "saved" | "in_plan" | "dismissed"

export type LocalTipView = {
  id: string
  /** null si no se pudo anclar a un lugar (entonces no hay "Al plan" ni aviso por cercanía). */
  placeId: string | null
  placeName: string
  category: string | null
  what: string
  why: string | null
  whenToGo: string | null
  priceHint: string | null
  recommender: string | null
  originalQuote: string | null
  translatedQuote: string | null
  walkMinutes: number | null
  stayMinutes: number | null
  status: TipStatus
}

/** "Te lo recomendó Camille" / "Te lo recomendaron". */
export const recommendedBy = (recommender: string | null) => {
  const who = recommender?.trim().replace(/[.\s]+$/, "")
  return who ? `Te lo recomendó ${who}` : "Te lo recomendó alguien del lugar"
}

const SLOT_MS = 30 * 60 * 1000

/** Horarios para "Al plan": la próxima media hora y una y dos horas después (en ISO). */
export function planSlots(nowMs: number): string[] {
  const first = Math.ceil(nowMs / SLOT_MS) * SLOT_MS
  return [0, 60, 120].map((min) => new Date(first + min * 60_000).toISOString())
}
