import "server-only"

import { redirect } from "next/navigation"
import { connection } from "next/server"

import type { Place } from "@/lib/agent/types"
import { findDemoAccount, type DemoAccount } from "@/lib/demo-accounts"
import { distanceMeters, nearestPlaceLabel, walkMinutes, type LatLng } from "@/lib/geo"
import { ensureNearbyPlaces } from "@/lib/places/nearby"
import { createClient } from "@/lib/supabase/server"

export { TRIP_TIME_ZONE } from "@/lib/config"
export const NEARBY_RADIUS_METERS = 4_000

export type Trip = {
  id: string
  destination: string
  country: string | null
  lat: number
  lng: number
  start_date: string
  end_date: string
}

export type ItineraryStatus = "planned" | "in_progress" | "done" | "skipped"
export type ItinerarySource = "user" | "agent" | "local_tip" | "event" | "calendar"

export type ItineraryItem = {
  id: string
  title: string
  notes: string | null
  starts_at: string
  ends_at: string | null
  lat: number | null
  lng: number | null
  place_id: string | null
  status: ItineraryStatus
  source: ItinerarySource
  locked: boolean
}

export const ITINERARY_COLUMNS = "id, title, notes, starts_at, ends_at, lat, lng, place_id, status, source, locked"

/** Restricciones no negociables y ritmo del viajero (B-2 las edita, el agente las respeta). */
export type TravelerConstraints = {
  dietary: string[]
  mobility: string | null
  dailyBudget: number | null
  pace: "tranquilo" | "intenso" | null
  schedule: "madrugador" | "noctámbulo" | null
}

/** De dónde sale `location`: la que manda el cliente, el último ping guardado, el centro del viaje o un valor fijo. */
export type LocationSource = "live" | "ping" | "trip" | "fallback"

export type NearbyPlace = Place & { distanceMeters: number; walkMinutes: number }

export type TravelerContext = {
  userId: string
  firstName: string
  fullName: string
  homeCity: string | null
  travelStyle: string | null
  account: DemoAccount | undefined
  interests: string[]
  constraints: TravelerConstraints
  /** Párrafo con lo que el agente aprendió del viajero (profile_facts), listo para las instrucciones. */
  profileSummary: string | null
  trip: Trip | null
  itinerary: ItineraryItem[]
  location: LatLng
  locationSource: LocationSource
  locationLabel: string
  nearby: NearbyPlace[]
}

const FALLBACK_LOCATION: LatLng = { lat: 48.8606, lng: 2.3522 }

export interface TravelerContextOptions {
  /** Ubicación en vivo del cliente (GPS simulado o real). Sin esto, se usa el último ping guardado. */
  location?: LatLng | null
}

/** Carga todo el contexto del viajero logueado. Redirige a /login si no hay sesión. */
export async function getTravelerContext(options: TravelerContextOptions = {}): Promise<TravelerContext> {
  // Depende de la hora actual (viaje activo, itinerario): siempre por request.
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().slice(0, 10)

  const [profileRes, interestsRes, tripRes, pingRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, home_city, travel_style, dietary, mobility, daily_budget, pace, schedule, compiled_summary")
      .eq("id", user.id)
      .single(),
    supabase.from("interests").select("tag").eq("user_id", user.id).order("created_at"),
    supabase
      .from("trips")
      .select("id, destination, country, lat, lng, start_date, end_date")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Último punto del GPS (B-1 lo manda cada 5 s o 25 m).
    supabase
      .from("pings")
      .select("lat, lng")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (profileRes.error) throw new Error(`No se pudo cargar el perfil: ${profileRes.error.message}`)
  if (interestsRes.error) throw new Error(`No se pudieron cargar los gustos: ${interestsRes.error.message}`)
  if (tripRes.error) throw new Error(`No se pudo cargar el viaje: ${tripRes.error.message}`)
  if (pingRes.error) throw new Error(`No se pudo cargar la ubicación: ${pingRes.error.message}`)

  const trip = tripRes.data as Trip | null
  const ping = pingRes.data as LatLng | null
  // En vivo (la manda el cliente durante la llamada) > último ping guardado > centro del viaje.
  const [location, locationSource]: [LatLng, LocationSource] = options.location
    ? [options.location, "live"]
    : ping
      ? [{ lat: ping.lat, lng: ping.lng }, "ping"]
      : trip
        ? [{ lat: trip.lat, lng: trip.lng }, "trip"]
        : [FALLBACK_LOCATION, "fallback"]
  const city = trip?.destination ?? "París"

  // Los lugares vienen de Google Places y quedan guardados en `places`.
  await ensureNearbyPlaces(location, city)

  const [itineraryRes, placesRes] = await Promise.all([
    trip
      ? supabase
          .from("itinerary_items")
          .select(ITINERARY_COLUMNS)
          .eq("trip_id", trip.id)
          .order("starts_at")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("places")
      .select("id, name, category, tags, description, lat, lng, rating, typical_visit_minutes")
      .eq("city", city)
      .eq("listed", true),
  ])

  if (itineraryRes.error) throw new Error(`No se pudo cargar el itinerario: ${itineraryRes.error.message}`)
  if (placesRes.error) throw new Error(`No se pudieron cargar los lugares: ${placesRes.error.message}`)

  const nearby = (placesRes.data as Place[])
    .map((p) => ({ ...p, distanceMeters: distanceMeters(location, p), walkMinutes: walkMinutes(location, p) }))
    .filter((p) => p.distanceMeters <= NEARBY_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  const profile = profileRes.data
  const fullName = profile.full_name as string

  return {
    userId: user.id,
    firstName: fullName.split(" ")[0],
    fullName,
    homeCity: profile.home_city,
    travelStyle: profile.travel_style,
    account: findDemoAccount(user.email),
    interests: interestsRes.data.map((i) => i.tag as string),
    constraints: {
      dietary: profile.dietary ?? [],
      mobility: profile.mobility,
      dailyBudget: profile.daily_budget,
      pace: profile.pace,
      schedule: profile.schedule,
    },
    profileSummary: profile.compiled_summary,
    trip,
    itinerary: (itineraryRes.data ?? []) as ItineraryItem[],
    location,
    locationSource,
    // Con todos los lugares de la ciudad, no solo los del radio: el más cercano decide.
    locationLabel: nearestPlaceLabel(location, placesRes.data as Place[], trip?.destination ?? "tu ubicación"),
    nearby,
  }
}

export function nextCommitment(itinerary: ItineraryItem[], now: Date): ItineraryItem | null {
  return itinerary.find((i) => new Date(i.starts_at) > now) ?? null
}
