import { redirect } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { MapPreview } from "@/components/home/map-preview"
import { ItinerarySection } from "@/components/itinerary/itinerary-section"
import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { needsOnboarding } from "@/lib/data/onboarding"
import { getTravelerContext } from "@/lib/data/session"
import { formatTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { zonedDateKey } from "@/lib/time/zoned"
import { matchInterests, type MatchablePlace } from "@/lib/profile/interests"

/** Lugares en la lista que se despliega desde el mapa. */
const MAX_NEARBY = 20

async function HomeContent() {
  // Primer login: antes de la home (y de buscar lugares), el onboarding por voz.
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && (await needsOnboarding(supabase, user.id))) redirect("/onboarding")

  const ctx = await getTravelerContext()
  const today = zonedDateKey(new Date(), ctx.timeZone)
  const todayItems = ctx.itinerary.filter((i) => zonedDateKey(new Date(i.starts_at), ctx.timeZone) === today)
  const forYou = (p: MatchablePlace) => matchInterests(p, ctx.interests).length > 0
  const nearby = [...ctx.nearby]
    .sort((a, b) => Number(forYou(b)) - Number(forYou(a)) || a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_NEARBY)
  const companionNames = Object.fromEntries(ctx.companions.map((c) => [c.userId, c.firstName]))

  return (
    <main className="animate-in fade-in mx-auto flex w-full max-w-md flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] duration-300">
      <MapPreview
        places={ctx.nearby.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          forYou: forYou(p),
        }))}
        stops={todayItems
          .filter((i) => i.lat !== null && i.lng !== null)
          .map((i) => ({
            id: i.id,
            title: i.title,
            time: formatTime(i.starts_at, ctx.timeZone),
            lat: i.lat!,
            lng: i.lng!,
          }))}
        nearby={nearby.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          walkMinutes: p.walkMinutes,
          forYou: forYou(p),
        }))}
      />

      <div className="px-4 pt-4">
        <ItinerarySection
          items={todayItems}
          timeZone={ctx.timeZone}
          today={today}
          companionNames={companionNames}
          places={ctx.nearby.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            walkMinutes: p.walkMinutes,
            visitMinutes: p.typical_visit_minutes,
          }))}
        />
      </div>
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}
