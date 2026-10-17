import { Suspense } from "react"

import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { getTravelerContext } from "@/lib/data/session"
import { formatTime } from "@/lib/format"
import { matchInterests, type MatchablePlace } from "@/lib/profile/interests"

import { MapScreen } from "./map-screen"

async function MapContent() {
  const ctx = await getTravelerContext()
  const forYou = (p: MatchablePlace) => matchInterests(p, ctx.interests).length > 0

  return (
    <MapScreen
      places={ctx.nearby.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        forYou: forYou(p),
      }))}
      stops={ctx.itinerary
        .filter((i) => i.lat !== null && i.lng !== null)
        .map((i) => ({ id: i.id, title: i.title, time: formatTime(i.starts_at, ctx.timeZone), lat: i.lat!, lng: i.lng! }))}
    />
  )
}

export default function MapPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MapContent />
    </Suspense>
  )
}
