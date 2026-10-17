import { Suspense } from "react"

import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { TripSharing, type TripPerson } from "@/components/trip/trip-sharing"
import { getTravelerContext } from "@/lib/data/session"
import { tripDay } from "@/lib/format"

async function TripContent() {
  const ctx = await getTravelerContext()
  const day = ctx.trip ? tripDay(ctx.trip.start_date, ctx.trip.end_date) : null
  // Viaje compartido: si nadie más es el dueño, el viaje es mío.
  const isOwner = !ctx.companions.some((c) => c.role === "owner")
  const limits = (dietary: string[], mobility: string | null) =>
    [...dietary, mobility ? `movilidad: ${mobility}` : null].filter(Boolean).join(", ") || null
  const people: TripPerson[] = [
    {
      userId: ctx.userId,
      name: ctx.fullName,
      note: limits(ctx.constraints.dietary, ctx.constraints.mobility),
      isOwner,
      isMe: true,
    },
    ...ctx.companions.map((c) => ({
      userId: c.userId,
      name: c.fullName,
      note: limits(c.dietary, c.mobility),
      isOwner: c.role === "owner",
      isMe: false,
    })),
  ].sort((a, b) => Number(b.isOwner) - Number(a.isOwner))
  const subtitle = [ctx.city, day && `Día ${day.day} de ${day.total}`].filter(Boolean).join(" · ")

  return (
    <main className="animate-in fade-in mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] duration-300">
      <div>
        <h1 className="text-[34px] leading-tight font-bold tracking-tight">Viaje</h1>
        {subtitle && <p className="text-muted-foreground text-[15px]">{subtitle}</p>}
      </div>
      {ctx.trip ? (
        <TripSharing people={people} isOwner={isOwner} />
      ) : (
        <p className="text-muted-foreground text-[15px]">Todavía no tenés un viaje en curso.</p>
      )}
    </main>
  )
}

export default function TripPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TripContent />
    </Suspense>
  )
}
