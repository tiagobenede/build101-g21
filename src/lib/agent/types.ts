import type { LatLng } from "@/lib/geo"

export type Place = {
  id: string
  name: string
  category: string
  tags: string[]
  description: string | null
  lat: number
  lng: number
  rating: number | null
  typical_visit_minutes: number
}

export type Commitment = {
  title: string
  startsAt: Date
}

export type AgentContext = {
  firstName: string
  interests: string[]
  location: LatLng
  locationLabel: string
  places: Place[]
  nextCommitment: Commitment | null
  now: Date
  timeZone: string
  alreadyRecommended: string[]
}

export type Recommendation = {
  place: Place
  walkMinutes: number
  stayMinutes: number
  matchedTags: string[]
  score: number
}

export type AgentReply = {
  text: string
  recommendations: Recommendation[]
  availableMinutes: number | null
}
