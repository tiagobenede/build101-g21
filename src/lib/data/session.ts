import "server-only"

import { redirect } from "next/navigation"
import { connection } from "next/server"

import type { Place } from "@/lib/agent/types"
import { findDemoAccount, type DemoAccount } from "@/lib/demo-accounts"
import { boundingBox, distanceMeters, nearestPlaceLabel, walkMinutes, type LatLng } from "@/lib/geo"
import { localeAt } from "@/lib/location/locale"
import { ensureNearbyPlaces } from "@/lib/places/nearby"
import { activeTripId, getTripMembers, type TripMember } from "@/lib/data/trips"
import { createClient } from "@/lib/supabase/server"

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
  /** Quién la sumó (en un viaje compartido puede ser otra persona). */
  created_by: string | null
}

export const ITINERARY_COLUMNS = "id, title, notes, starts_at, ends_at, lat, lng, place_id, status, source, locked, created_by"

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

/** `rating_count`: reseñas en Google (qué tan conocido es); null en los lugares del seed. */
export type NearbyPlace = Place & { distanceMeters: number; walkMinutes: number; rating_count?: number | null }

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
  /** Quienes comparten el viaje, sin contarme (vacío si viajo solo). */
  companions: TripMember[]
  itinerary: ItineraryItem[]
  location: LatLng
  locationSource: LocationSource
  locationLabel: string
  /** Zona horaria, ciudad y país de donde está ahora (no del viaje): horas y búsquedas salen de acá. */
  timeZone: string
  city: string | null
  country: string | null
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

  // Viaje en curso: puede ser propio o uno compartido al que me sumé.
  const tripId = await activeTripId(supabase)

  const [profileRes, interestsRes, tripRes, pingRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, home_city, travel_style, dietary, mobility, daily_budget, pace, schedule, compiled_summary")
      .eq("id", user.id)
      .single(),
    supabase.from("interests").select("tag").eq("user_id", user.id).order("created_at"),
    tripId
      ? supabase.from("trips").select("id, destination, country, lat, lng, start_date, end_date").eq("id", tripId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
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
  // Zona horaria y ciudad de donde está ahora (no del viaje).
  const locale = await localeAt(location)

  // Los lugares vienen de Google Places y quedan guardados en `places`.
  await ensureNearbyPlaces(location, locale.city ?? "")
  const box = boundingBox(location, NEARBY_RADIUS_METERS)

  const [itineraryRes, placesRes, members] = await Promise.all([
    trip
      ? supabase
          .from("itinerary_items")
          .select(ITINERARY_COLUMNS)
          .eq("trip_id", trip.id)
          .order("starts_at")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("places")
      .select("id, name, category, tags, description, lat, lng, rating, typical_visit_minutes, rating_count")
      // Por cercanía, no por ciudad: así funciona en cualquier lugar del mundo.
      .gte("lat", box.minLat)
      .lte("lat", box.maxLat)
      .gte("lng", box.minLng)
      .lte("lng", box.maxLng)
      .eq("listed", true),
    trip ? getTripMembers(supabase, trip.id) : Promise.resolve([]),
  ])

  if (itineraryRes.error) throw new Error(`No se pudo cargar el itinerario: ${itineraryRes.error.message}`)
  if (placesRes.error) throw new Error(`No se pudieron cargar los lugares: ${placesRes.error.message}`)

  const nearby = (placesRes.data as (Place & { rating_count: number | null })[])
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
    companions: members.filter((m) => m.userId !== user.id),
    itinerary: (itineraryRes.data ?? []) as ItineraryItem[],
    location,
    locationSource,
    locationLabel: nearestPlaceLabel(location, placesRes.data as Place[], locale.city ?? "tu ubicación"),
    timeZone: locale.timeZone,
    city: locale.city,
    country: locale.country,
    nearby,
  }
}

export function nextCommitment(itinerary: ItineraryItem[], now: Date): ItineraryItem | null {
  return itinerary.find((i) => new Date(i.starts_at) > now) ?? null
}
