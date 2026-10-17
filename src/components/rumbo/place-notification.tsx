import type { ReactNode } from "react"

import { CategoryIcon } from "@/components/rumbo/category-icon"
import type { MentionedPlace } from "@/hooks/voice-session-types"
import { cn } from "@/lib/utils"

interface NotificationCardProps {
  category: string
  title: string
  /** A la derecha del título ("ahora", "hace 3 min", un estado). */
  trailing?: ReactNode
  /** Las líneas debajo del título. */
  children?: ReactNode
  /** Botones chicos, abajo. */
  actions?: ReactNode
  className?: string
}

/**
 * Tarjeta de lugar con el formato de una notificación de iOS: ícono, título y dos o
 * tres líneas. La usan los lugares que nombra el agente en la llamada y las
 * recomendaciones de personas locales en el traductor, así tienen el mismo tamaño.
 */
export function NotificationCard({ category, title, trailing, children, actions, className }: NotificationCardProps) {
  return (
    <article
      className={cn(
        "animate-in fade-in slide-in-from-top-3 bg-card/90 flex flex-col gap-2.5 rounded-[22px] p-3.5 shadow-[0_1px_3px_rgb(0_0_0/0.06)] backdrop-blur-xl duration-300",
        className
      )}
    >
      <div className="flex gap-3">
        <CategoryIcon category={category} className="size-10 shrink-0 rounded-[11px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-[15px] font-semibold">{title}</h3>
            {trailing && <span className="text-muted-foreground shrink-0 text-[13px]">{trailing}</span>}
          </div>
          {children}
        </div>
      </div>
      {actions}
    </article>
  )
}

interface PlaceNotificationProps {
  place: MentionedPlace
  now: number
}

function ago(now: number, then: number): string {
  const minutes = Math.floor((now - then) / 60_000)
  return minutes < 1 ? "ahora" : `hace ${minutes} min`
}

/** Lugar que nombró el agente en la llamada. */
export function PlaceNotification({ place, now }: PlaceNotificationProps) {
  return (
    <NotificationCard
      category={place.category}
      title={place.name}
      trailing={<span suppressHydrationWarning>{ago(now, place.mentionedAt)}</span>}
    >
      <p className="text-[15px] leading-snug">
        {place.walkMinutes} min a pie · ~{place.stayMinutes} min de visita
      </p>
      {place.description && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[13px] leading-snug">{place.description}</p>}
    </NotificationCard>
  )
}
