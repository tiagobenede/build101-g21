import { Suspense } from "react"

import { TalkSkeleton } from "@/components/rumbo/talk-skeleton"
import { getTravelerContext, nextCommitment } from "@/lib/data/session"
import { formatTime } from "@/lib/format"
import { matchInterests } from "@/lib/profile/interests"
import { localLanguage } from "@/lib/translate/config"

import { TalkClient } from "./talk-client"

async function TalkContent() {
  const ctx = await getTravelerContext()
  const commitment = nextCommitment(ctx.itinerary, new Date())

  return (
    <TalkClient
      location={{
        city: [ctx.city, ctx.country].filter(Boolean).join(", "),
        timeZone: ctx.timeZone,
        // El traductor arranca en el idioma del país donde está (en francés en París).
        localLang: localLanguage(ctx.countryCode, "es"),
      }}
      nextCommitment={commitment ? { title: commitment.title, startsAt: commitment.starts_at } : null}
      mapPlaces={ctx.nearby.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        forYou: matchInterests(p, ctx.interests).length > 0,
      }))}
      stops={ctx.itinerary
        .filter((i) => i.lat !== null && i.lng !== null)
        .map((i) => ({ id: i.id, title: i.title, time: formatTime(i.starts_at, ctx.timeZone), lat: i.lat!, lng: i.lng! }))}
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
    <Suspense fallback={<TalkSkeleton />}>
      <TalkContent />
    </Suspense>
  )
}
