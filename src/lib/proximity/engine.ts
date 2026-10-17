import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { boundingBox, nearestPlaceLabel, type LatLng } from "@/lib/geo"
import { askJevChoice } from "@/lib/jev"
import { timeZoneAt } from "@/lib/location/locale"
import { sendPushToUser } from "@/lib/push/send"
import { activeTrip } from "@/lib/translate/server"
import { PROXIMITY } from "@/lib/tuning"
import { matchInterests } from "@/lib/profile/interests"

import {
  buildInterestQuestion,
  distinctInterestPlaces,
  INTEREST_INSTRUCTIONS,
  optionsSignature,
  readInterestChoice,
  type InterestPlace,
  type TravelerSnapshot,
} from "./interest"
import {
  eligible,
  inCooldown,
  INTEREST_RADIUS_METERS,
  pickRuleCandidate,
  reasonText,
  type Candidate,
  type NextLocked,
  type Situation,
} from "./rules"

/**
 * Motor de avisos por cercanía (C-6). Corre después de cada ping (`savePing`, con
 * `after`): si hay algo que avisar, inserta en `notifications` y B-6 (pantalla) y A-6
 * (voz) se enteran por Realtime. Sin modelos para lo que se decide por reglas; Jev solo
 * para elegir entre los lugares que van con los gustos.
 */

// Umbrales: se cambian en src/lib/tuning.ts (o por variable de entorno).
const COOLDOWN_MS = PROXIMITY.cooldownSeconds * 1000
const JEV_REPEAT_MS = PROXIMITY.jevRepeatMinutes * 60 * 1000
const JEV_TIMEOUT_MS = PROXIMITY.jevTimeoutMs
/** Actividades del plan que cuentan como "de hoy" alrededor de ahora. */
const PLAN_WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000
const PLAN_WINDOW_AFTER_MS = 18 * 60 * 60 * 1000

export type Notification = { id: string; place_id: string; reason_text: string; candidate_type: Candidate["kind"] }

const running = new Set<string>()
const lastJevQuestion = new Map<string, { signature: string; at: number }>()

type Row = Record<string, unknown>
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/** Revisa si hay algo para avisar en esta posición y, si hay, lo guarda. `now`: la hora del viajero (puede ser simulada). */
export async function checkProximity(db: SupabaseClient, userId: string, position: LatLng, now = new Date()): Promise<Notification | null> {
  // Un ping a la vez por usuario: si el anterior todavía está decidiendo, este se saltea.
  if (running.has(userId)) return null
  running.add(userId)
  try {
    return await check(db, userId, position, now)
  } finally {
    running.delete(userId)
  }
}

async function check(db: SupabaseClient, userId: string, position: LatLng, now: Date): Promise<Notification | null> {
  const { data: sent, error: sentError } = await db
    .from("notifications")
    .select("place_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500)
  if (sentError) throw new Error(`No se pudieron leer los avisos: ${sentError.message}`)

  // Los avisos se guardan con la hora real: se pasan a la del viajero para medir la pausa.
  const shiftMs = now.getTime() - Date.now()
  const lastNotifiedAt = sent[0] ? new Date(new Date(sent[0].created_at as string).getTime() + shiftMs) : null
  if (inCooldown({ lastNotifiedAt, cooldownMs: COOLDOWN_MS, now })) return null

  const trip = await activeTrip(db)
  const box = boundingBox(position, INTEREST_RADIUS_METERS)
  const [tipsRes, planRes, profileRes, interestsRes, placesRes] = await Promise.all([
    // Toda recomendación no descartada avisa: guardada o ya agendada.
    db.from("local_tips").select("place_id, recommender, places(name, lat, lng)").eq("user_id", userId).in("status", ["saved", "in_plan"]).not("place_id", "is", null),
    trip
      ? db
          .from("itinerary_items")
          .select("title, starts_at, lat, lng, place_id, status, locked")
          .eq("trip_id", trip.id)
          .gte("starts_at", new Date(now.getTime() - PLAN_WINDOW_BEFORE_MS).toISOString())
          .lte("starts_at", new Date(now.getTime() + PLAN_WINDOW_AFTER_MS).toISOString())
          .order("starts_at")
      : Promise.resolve({ data: [] as Row[], error: null }),
    db.from("profiles").select("dietary, mobility, daily_budget, pace, compiled_summary").eq("id", userId).single(),
    db.from("interests").select("tag").eq("user_id", userId),
    db
      .from("places")
      .select("id, name, category, tags, description, rating, rating_count, lat, lng, types:data->types")
      .eq("listed", true)
      .gte("lat", box.minLat)
      .lte("lat", box.maxLat)
      .gte("lng", box.minLng)
      .lte("lng", box.maxLng),
  ])
  for (const r of [tipsRes, planRes, profileRes, interestsRes, placesRes]) if (r.error) throw new Error(r.error.message)

  const interests = (interestsRes.data as Row[]).map((i) => i.tag as string)
  const plan = planRes.data as Row[]

  const candidates: Candidate[] = []
  for (const t of tipsRes.data as Row[]) {
    const place = one(t.places as { name: string; lat: number; lng: number } | null)
    if (place) candidates.push({ kind: "local_tip", placeId: t.place_id as string, name: place.name, recommender: t.recommender as string | null, lat: place.lat, lng: place.lng })
  }
  for (const i of plan) {
    if (!i.place_id || i.lat === null || i.lng === null || !["planned", "in_progress"].includes(i.status as string)) continue
    candidates.push({ kind: "itinerary", placeId: i.place_id as string, name: i.title as string, startsAt: i.starts_at as string, lat: i.lat as number, lng: i.lng as number })
  }
  const nearbyPlaces = placesRes.data as Row[]
  for (const p of nearbyPlaces) {
    // Mismo cruce que el agente: tags de la lista y gustos propios por nombre o tipo de Google.
    const matched = matchInterests(
      { name: p.name as string, category: p.category as string, tags: p.tags as string[], googleTypes: (p.types as string[] | null) ?? [] },
      interests
    )
    if (matched.length === 0) continue
    candidates.push({
      kind: "interest",
      placeId: p.id as string,
      name: p.name as string,
      category: p.category as string,
      matchedTags: matched,
      rating: p.rating as number | null,
      ratingCount: p.rating_count as number | null,
      description: p.description as string | null,
      lat: p.lat as number,
      lng: p.lng as number,
    } as InterestPlace)
  }

  // Fichas duplicadas y partes de otro lugar afuera, antes de mirar qué ya se avisó: si no, avisado
  // el Louvre, al rato aparece su sala (Appartements Napoléon III) como si fuera otro lugar.
  const interestKept = new Set(
    distinctInterestPlaces(candidates.filter((c): c is InterestPlace => c.kind === "interest")).map((p) => p.placeId)
  )
  const shown = candidates.filter((c) => c.kind !== "interest" || interestKept.has(c.placeId))

  const nextLockedRow = plan.find((i) => i.locked && new Date(i.starts_at as string) > now)
  const nextLocked: NextLocked | null = nextLockedRow ? { placeId: nextLockedRow.place_id as string | null, startsAt: nextLockedRow.starts_at as string } : null
  const situation: Situation = {
    position,
    now,
    notifiedPlaceIds: new Set(sent.map((n) => n.place_id as string)),
    lastNotifiedAt,
    cooldownMs: COOLDOWN_MS,
    nextLocked,
  }
  const timeZone = timeZoneAt(position)

  const byRule = pickRuleCandidate(shown, situation)
  if (byRule) return save(db, userId, byRule, reasonText(byRule, position, timeZone))

  const liked = eligible(shown, situation).filter((c): c is InterestPlace => c.kind === "interest")
  if (liked.length === 0 || !process.env.TYPESAFE_API_KEY) return null

  const signature = optionsSignature(liked)
  const previous = lastJevQuestion.get(userId)
  // Freno de gasto: con la hora real, aunque el viajero cambie la simulada.
  if (previous?.signature === signature && Date.now() - previous.at < JEV_REPEAT_MS) return null
  lastJevQuestion.set(userId, { signature, at: Date.now() })

  const profile = profileRes.data as Row
  const time = (iso: string) => new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso))
  const traveler: TravelerSnapshot = {
    interests,
    constraints:
      [
        (profile.dietary as string[]).length ? `dieta: ${(profile.dietary as string[]).join(", ")}` : null,
        profile.mobility ? `movilidad: ${profile.mobility}` : null,
        profile.daily_budget ? `presupuesto: ${profile.daily_budget} € por día` : null,
      ]
        .filter(Boolean)
        .join("; ") || null,
    profileSummary: profile.compiled_summary as string | null,
    localTime: time(now.toISOString()),
    whereLabel: nearestPlaceLabel(position, nearbyPlaces as (LatLng & { name: string })[], trip?.destination ?? "la calle"),
    todayPlan: plan.map((i) => `${time(i.starts_at as string)} ${i.title}${i.locked ? " (reserva)" : ""} (${i.status})`),
    nextCommitment: nextLocked
      ? `${nextLockedRow!.title} a las ${time(nextLocked.startsAt)} (reserva, en ${Math.round((new Date(nextLocked.startsAt).getTime() - now.getTime()) / 60_000)} min)`
      : null,
  }

  const { state, criteria, options } = buildInterestQuestion(liked, position, traveler)
  const answer = await askJevChoice({ state, instructions: INTEREST_INSTRUCTIONS, criteria, timeoutMs: JEV_TIMEOUT_MS }).catch((err: unknown) => {
    console.error("[proximity] jev", err instanceof Error ? err.message : err)
    return null
  })
  if (process.env.PROXIMITY_DEBUG) console.info("[proximity] jev pregunta:", JSON.stringify({ state, criteria }, null, 1))
  if (process.env.PROXIMITY_DEBUG && answer) {
    const name = (key: string) => options.get(key)?.name ?? key
    const probs = Object.entries(answer.probabilities ?? {}).sort(([, x], [, y]) => y - x)
    console.info(`[proximity] jev (${options.size} opciones, confianza ${answer.confidence}):`, probs.map(([k, v]) => `${name(k)} ${(v * 100).toFixed(0)}%`).join(", "))
  }
  const chosen = answer && readInterestChoice(answer, options)
  return chosen ? save(db, userId, chosen, reasonText(chosen, position, timeZone)) : null
}

async function save(db: SupabaseClient, userId: string, c: Candidate, reason: string): Promise<Notification | null> {
  const { data, error } = await db
    .from("notifications")
    .upsert(
      { user_id: userId, place_id: c.placeId, reason_text: reason, candidate_type: c.kind },
      { onConflict: "user_id,place_id", ignoreDuplicates: true }
    )
    .select("id, place_id, reason_text, candidate_type")
    .maybeSingle()
  if (error) throw new Error(`No se pudo guardar el aviso: ${error.message}`)
  // null: ya se había avisado de este lugar (otro ping llegó primero).
  if (!data) return null

  // Push al sistema (si el viajero activó los avisos). Si falla, el aviso igual quedó guardado
  // y la página lo muestra por Realtime.
  await sendPushToUser(db, userId, { title: c.name, body: reason, url: "/talk", tag: c.placeId }).catch((err: unknown) =>
    console.error("[proximity] push", err instanceof Error ? err.message : err)
  )
  return data as Notification
}
