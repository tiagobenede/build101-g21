import { ChevronRightIcon, MapIcon, MicIcon } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { ItinerarySection } from "@/components/itinerary/itinerary-section"
import { TripSharing } from "@/components/trip/trip-sharing"
import { AppHeader } from "@/components/rumbo/app-header"
import { CategoryIcon } from "@/components/rumbo/category-icon"
import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { GroupedList, Section } from "@/components/rumbo/section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { getTravelerContext } from "@/lib/data/session"
import { tripDay } from "@/lib/format"
import { zonedDateKey } from "@/lib/time/zoned"

const MAX_NEARBY = 6

async function HomeContent() {
  const ctx = await getTravelerContext()
  const today = zonedDateKey(new Date(), ctx.timeZone)
  const todayItems = ctx.itinerary.filter((i) => zonedDateKey(new Date(i.starts_at), ctx.timeZone) === today)
  const day = ctx.trip ? tripDay(ctx.trip.start_date, ctx.trip.end_date) : null
  const forYou = (tags: string[]) => tags.some((t) => ctx.interests.includes(t))
  const nearby = [...ctx.nearby]
    .sort((a, b) => Number(forYou(b.tags)) - Number(forYou(a.tags)) || a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_NEARBY)
  const forYouCount = ctx.nearby.filter((p) => forYou(p.tags)).length
  const subtitle = [ctx.locationLabel, day && `Día ${day.day} de ${day.total}`].filter(Boolean).join(" · ")
  // Viaje compartido: si nadie más es el dueño, el viaje es mío.
  const isOwner = !ctx.companions.some((c) => c.role === "owner")
  const companionNames = Object.fromEntries(ctx.companions.map((c) => [c.userId, c.firstName]))
  const limits = (dietary: string[], mobility: string | null) =>
    [...dietary, mobility ? `movilidad: ${mobility}` : null].filter(Boolean).join(", ") || null
  const people = [
    { userId: ctx.userId, name: ctx.fullName, note: limits(ctx.constraints.dietary, ctx.constraints.mobility), isOwner, isMe: true },
    ...ctx.companions.map((c) => ({ userId: c.userId, name: c.fullName, note: limits(c.dietary, c.mobility), isOwner: c.role === "owner", isMe: false })),
  ].sort((a, b) => Number(b.isOwner) - Number(a.isOwner))

  return (
    <main className="animate-in fade-in mx-auto flex w-full max-w-md flex-col gap-8 px-4 pt-5 pb-16 duration-300">
      <div>
        <AppHeader account={ctx.account} fullName={ctx.fullName} subtitle={subtitle} />
        <h1 className="mt-3 text-[34px] leading-tight font-bold tracking-tight">Hola, {ctx.firstName}</h1>
      </div>

      <Card className="gap-4 rounded-2xl shadow-none ring-0">
        <CardHeader>
          <CardTitle className="text-[17px]">¿Cuánto tiempo tenés?</CardTitle>
          <CardDescription className="text-[15px]">
            Contale a Rumbo y te dice qué hacer cerca. Hay {forYouCount} lugares que van con tus gustos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="h-12 w-full rounded-full text-[15px]">
            <Link href="/talk">
              <MicIcon />
              Hablar con Rumbo
            </Link>
          </Button>
        </CardContent>
      </Card>

      <GroupedList>
        <Item asChild className="rounded-none px-4 py-3 hover:bg-muted/60">
          <Link href="/map">
            <ItemMedia>
              <span className="bg-brand flex size-9 items-center justify-center rounded-[10px] text-white">
                <MapIcon className="size-[18px]" />
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-[15px]">Mapa</ItemTitle>
              <ItemDescription className="text-[13px]">Dónde estás, qué hay cerca y tu plan de hoy</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="text-muted-foreground/60 size-4" />
            </ItemActions>
          </Link>
        </Item>
      </GroupedList>

      <Section title="Tus gustos">
        <div className="flex flex-wrap gap-2">
          {ctx.interests.map((tag) => (
            <Badge key={tag} variant="secondary" className="h-7 rounded-full bg-card px-3 text-[13px] capitalize">
              {tag}
            </Badge>
          ))}
        </div>
      </Section>

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

      {ctx.trip && <TripSharing people={people} isOwner={isOwner} />}

      <Section title="Cerca tuyo">
        <GroupedList>
          {nearby.map((place) => (
            <Item key={place.id} className="rounded-none px-4 py-3">
              <ItemMedia>
                <CategoryIcon category={place.category} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="text-[15px]">{place.name}</ItemTitle>
                <ItemDescription className="text-[13px]">
                  {place.category} · {place.walkMinutes} min a pie
                </ItemDescription>
              </ItemContent>
              {forYou(place.tags) && (
                <ItemActions>
                  <Badge className="bg-brand/10 text-brand rounded-full border-0">Para vos</Badge>
                </ItemActions>
              )}
            </Item>
          ))}
        </GroupedList>
      </Section>
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
