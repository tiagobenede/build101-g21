import "server-only"

import { redirect } from "next/navigation"
import { connection } from "next/server"

import type { Place } from "@/lib/agent/types"
import { findDemoAccount, type DemoAccount } from "@/lib/demo-accounts"
import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo"
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

export type ItineraryItem = {
  id: string
  title: string
  notes: string | null
  starts_at: string
  ends_at: string | null
  lat: number | null
  lng: number | null
}

export type NearbyPlace = Place & { distanceMeters: number; walkMinutes: number }

export type TravelerContext = {
  userId: string
  firstName: string
  fullName: string
  homeCity: string | null
  travelStyle: string | null
  account: DemoAccount | undefined
  interests: string[]
  trip: Trip | null
  itinerary: ItineraryItem[]
  location: LatLng
  locationLabel: string
  nearby: NearbyPlace[]
}

const FALLBACK_LOCATION: LatLng = { lat: 48.8606, lng: 2.3522 }

/** Carga todo el contexto del viajero logueado. Redirige a /login si no hay sesión. */
export async function getTravelerContext(): Promise<TravelerContext> {
  // Depende de la hora actual (viaje activo, itinerario): siempre por request.
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().slice(0, 10)

  const [profileRes, interestsRes, tripRes] = await Promise.all([
    supabase.from("profiles").select("full_name, home_city, travel_style").eq("id", user.id).single(),
    supabase.from("interests").select("tag").eq("user_id", user.id).order("created_at"),
    supabase
      .from("trips")
      .select("id, destination, country, lat, lng, start_date, end_date")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (profileRes.error) throw new Error(`No se pudo cargar el perfil: ${profileRes.error.message}`)
  if (interestsRes.error) throw new Error(`No se pudieron cargar los gustos: ${interestsRes.error.message}`)
  if (tripRes.error) throw new Error(`No se pudo cargar el viaje: ${tripRes.error.message}`)

  const trip = tripRes.data as Trip | null
  // Ubicación simulada: centro del destino. Luego: navigator.geolocation.
  const location: LatLng = trip ? { lat: trip.lat, lng: trip.lng } : FALLBACK_LOCATION

  const [itineraryRes, placesRes] = await Promise.all([
    trip
      ? supabase
          .from("itinerary_items")
          .select("id, title, notes, starts_at, ends_at, lat, lng")
          .eq("trip_id", trip.id)
          .order("starts_at")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("places")
      .select("id, name, category, tags, description, lat, lng, rating, typical_visit_minutes")
      .eq("city", trip?.destination ?? "París"),
  ])

  if (itineraryRes.error) throw new Error(`No se pudo cargar el itinerario: ${itineraryRes.error.message}`)
  if (placesRes.error) throw new Error(`No se pudieron cargar los lugares: ${placesRes.error.message}`)

  const nearby = (placesRes.data as Place[])
    .map((p) => ({ ...p, distanceMeters: distanceMeters(location, p), walkMinutes: walkMinutes(location, p) }))
    .filter((p) => p.distanceMeters <= NEARBY_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  const fullName = profileRes.data.full_name as string

  return {
    userId: user.id,
    firstName: fullName.split(" ")[0],
    fullName,
    homeCity: profileRes.data.home_city,
    travelStyle: profileRes.data.travel_style,
    account: findDemoAccount(user.email),
    interests: interestsRes.data.map((i) => i.tag as string),
    trip,
    itinerary: (itineraryRes.data ?? []) as ItineraryItem[],
    location,
    locationLabel: trip ? `Centre Pompidou, ${trip.destination}` : "tu ubicación",
    nearby,
  }
}

export function nextCommitment(itinerary: ItineraryItem[], now: Date): ItineraryItem | null {
  return itinerary.find((i) => new Date(i.starts_at) > now) ?? null
}
