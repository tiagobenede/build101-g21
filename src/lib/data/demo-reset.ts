import "server-only"

import type { LatLng } from "@/lib/geo"
import { createAdminClient } from "@/lib/supabase/admin"
import { serverNow } from "@/lib/time/server-clock"
import { zonedDateKey, zonedTimeToIso } from "@/lib/time/zoned"

/**
 * Vuelve las cuentas demo a como quedan con `supabase/seed.sql`, sin reiniciar toda la
 * base: borra lo que dejó el uso (charlas, avisos, recomendaciones, cambios al plan,
 * pings) y vuelve a poner perfiles, gustos, fechas del viaje, plan de hoy y dónde arranca
 * cada uno. Los lugares de Google (`places`) quedan: volver a pedirlos cuesta.
 *
 * Los datos son los mismos que los del seed: si se cambia uno, cambiar el otro.
 */

const PARIS = "Europe/Paris"

type SeedUser = {
  id: string
  tripId: string
  profile: { full_name: string; home_city: string; travel_style: string | null; onboarded: boolean }
  interests: string[]
  trip: { startOffsetDays: number; endOffsetDays: number }
  /** Hora de París de hoy ("HH:MM"). */
  plan: { title: string; notes: string; from: string; to: string; at: LatLng }[]
  start?: LatLng
}

const SEED_USERS: readonly SeedUser[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    tripId: "aaaaaaa1-0000-4000-8000-000000000001",
    profile: { full_name: "Tiago", home_city: "Montevideo", travel_style: "Curioso, camina todo, ama los fierros", onboarded: true },
    interests: ["autos", "diseño", "arquitectura", "café"],
    trip: { startOffsetDays: -2, endOffsetDays: 5 },
    plan: [
      { title: "Almuerzo con amigos", notes: "Le Marais", from: "13:00", to: "14:30", at: { lat: 48.8578, lng: 2.3622 } },
      { title: "Tour guiado Torre Eiffel", notes: "Llegar 15 min antes", from: "17:00", to: "19:00", at: { lat: 48.8584, lng: 2.2945 } },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    tripId: "aaaaaaa1-0000-4000-8000-000000000002",
    profile: { full_name: "Lucas", home_city: "Buenos Aires", travel_style: "Museos, historia y librerías", onboarded: true },
    interests: ["arte", "historia", "libros", "louvre"],
    trip: { startOffsetDays: -1, endOffsetDays: 3 },
    plan: [
      {
        title: "Encuentro con amigos en el Jardin du Luxembourg",
        notes: "Fontaine Médicis",
        from: "18:00",
        to: "19:30",
        at: { lat: 48.8484, lng: 2.3404 },
      },
    ],
    start: { lat: 48.86271, lng: 2.33531 },
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    tripId: "aaaaaaa1-0000-4000-8000-000000000003",
    profile: { full_name: "Nicolas", home_city: "Santiago", travel_style: "Foodie, mercados y parques", onboarded: true },
    interests: ["comida", "mercados", "parques", "café"],
    trip: { startOffsetDays: 0, endOffsetDays: 6 },
    plan: [{ title: "Clase de cocina francesa", notes: "Traer delantal", from: "18:00", to: "20:00", at: { lat: 48.865, lng: 2.36 } }],
    start: { lat: 40.7359, lng: -73.9911 },
  },
  {
    // Primer login: sin gustos ni onboarding (al entrar también se resetea).
    id: "44444444-4444-4444-8444-444444444444",
    tripId: "aaaaaaa1-0000-4000-8000-000000000004",
    profile: { full_name: "Alex Romero", home_city: "Montevideo", travel_style: null, onboarded: false },
    interests: [],
    trip: { startOffsetDays: 0, endOffsetDays: 4 },
    plan: [],
  },
]

const addDays = (dateKey: string, days: number) =>
  new Date(Date.parse(`${dateKey}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

export async function resetDemoData(): Promise<void> {
  const db = createAdminClient()
  const userIds = SEED_USERS.map((u) => u.id)
  const tripIds = SEED_USERS.map((u) => u.tripId)
  const check = (label: string, r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(`No se pudo reiniciar (${label}): ${r.error.message}`)
  }

  // 1. Lo que dejó el uso. Las charlas se llevan sus mensajes y recomendaciones (cascade).
  for (const [label, run] of [
    ["avisos", () => db.from("notifications").delete().in("user_id", userIds)],
    ["recomendaciones de locales", () => db.from("local_tips").delete().in("user_id", userIds)],
    ["recomendaciones", () => db.from("recommendations").delete().in("user_id", userIds)],
    ["charlas", () => db.from("conversations").delete().in("user_id", userIds)],
    ["datos recordados", () => db.from("profile_facts").delete().in("user_id", userIds)],
    ["pings", () => db.from("pings").delete().in("user_id", userIds)],
    ["gustos", () => db.from("interests").delete().in("user_id", userIds)],
    ["plan", () => db.from("itinerary_items").delete().in("trip_id", tripIds)],
    ["deshacer", () => db.from("itinerary_snapshots").delete().in("trip_id", tripIds)],
    ["invitaciones", () => db.from("trip_invites").delete().in("trip_id", tripIds)],
    // Quien se sumó a un viaje ajeno; el dueño queda (lo pone un trigger al crear el viaje).
    ["compañeros", () => db.from("trip_members").delete().in("trip_id", tripIds).eq("role", "member")],
  ] as const) {
    check(label, await run())
  }

  // 2. Como en el seed, con "hoy" en París (la hora simulada, si hay).
  const now = await serverNow()
  const today = zonedDateKey(now, PARIS)
  for (const u of SEED_USERS) {
    check(
      "perfil",
      await db
        .from("profiles")
        .update({
          full_name: u.profile.full_name,
          home_city: u.profile.home_city,
          travel_style: u.profile.travel_style,
          onboarded_at: u.profile.onboarded ? now.toISOString() : null,
          dietary: [],
          mobility: null,
          daily_budget: null,
          pace: null,
          schedule: null,
          compiled_summary: null,
        })
        .eq("id", u.id)
    )
    check(
      "viaje",
      await db
        .from("trips")
        .update({ start_date: addDays(today, u.trip.startOffsetDays), end_date: addDays(today, u.trip.endOffsetDays) })
        .eq("id", u.tripId)
    )
  }

  const interests = SEED_USERS.flatMap((u) => u.interests.map((tag) => ({ user_id: u.id, tag })))
  const plan = SEED_USERS.flatMap((u) =>
    u.plan.map((p) => ({
      trip_id: u.tripId,
      title: p.title,
      notes: p.notes,
      starts_at: zonedTimeToIso(today, p.from, PARIS),
      ends_at: zonedTimeToIso(today, p.to, PARIS),
      lat: p.at.lat,
      lng: p.at.lng,
    }))
  )
  const pings = SEED_USERS.flatMap((u) => (u.start ? [{ user_id: u.id, lat: u.start.lat, lng: u.start.lng, heading: null, source: "mock" }] : []))
  check("gustos", await db.from("interests").insert(interests))
  check("plan", await db.from("itinerary_items").insert(plan))
  check("pings", await db.from("pings").insert(pings))
}
