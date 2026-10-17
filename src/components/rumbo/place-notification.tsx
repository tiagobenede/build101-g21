import { CategoryIcon } from "@/components/rumbo/category-icon"
import type { MentionedPlace } from "@/hooks/voice-session-types"

interface PlaceNotificationProps {
  place: MentionedPlace
  now: number
}

function ago(now: number, then: number): string {
  const minutes = Math.floor((now - then) / 60_000)
  return minutes < 1 ? "ahora" : `hace ${minutes} min`
}

/** Tarjeta de recomendación con el formato de una notificación de iOS. */
export function PlaceNotification({ place, now }: PlaceNotificationProps) {
  return (
    <article className="animate-in fade-in slide-in-from-top-3 bg-card/90 flex gap-3 rounded-[22px] p-3.5 shadow-[0_1px_3px_rgb(0_0_0/0.06)] backdrop-blur-xl duration-300">
      <CategoryIcon category={place.category} className="size-10 rounded-[11px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold">{place.name}</h3>
          <span className="text-muted-foreground shrink-0 text-[13px]" suppressHydrationWarning>
            {ago(now, place.mentionedAt)}
          </span>
        </div>
        <p className="text-[15px] leading-snug">
          {place.walkMinutes} min a pie · ~{place.stayMinutes} min de visita
        </p>
        {place.description && (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[13px] leading-snug">{place.description}</p>
        )}
      </div>
    </article>
  )
}
