import { Suspense } from "react"

import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { getTravelerContext, nextCommitment, TRIP_TIME_ZONE } from "@/lib/data/session"
import { formatTime, tripDay } from "@/lib/format"

import { TalkClient } from "./talk-client"

async function TalkContent() {
  const ctx = await getTravelerContext()
  const commitment = nextCommitment(ctx.itinerary, new Date())
  const day = ctx.trip ? tripDay(ctx.trip.start_date, ctx.trip.end_date) : null

  return (
    <TalkClient
      location={{
        city: [ctx.trip?.destination, ctx.trip?.country].filter(Boolean).join(", "),
        tripDay: day ? `Día ${day.day} de ${day.total}` : null,
        timeZone: TRIP_TIME_ZONE,
      }}
      nextCommitment={commitment ? { title: commitment.title, startsAt: commitment.starts_at } : null}
      mapPlaces={ctx.nearby.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        forYou: p.tags.some((t) => ctx.interests.includes(t)),
      }))}
      stops={ctx.itinerary
        .filter((i) => i.lat !== null && i.lng !== null)
        .map((i) => ({ id: i.id, title: i.title, time: formatTime(i.starts_at), lat: i.lat!, lng: i.lng! }))}
      places={ctx.nearby.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        walkMinutes: p.walkMinutes,
        stayMinutes: p.typical_visit_minutes,
      }))}
    />
  )
}

export default function TalkPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TalkContent />
    </Suspense>
  )
}
