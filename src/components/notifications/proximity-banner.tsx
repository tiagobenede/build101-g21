"use client"

import { XIcon } from "lucide-react"

import { CategoryIcon } from "@/components/rumbo/category-icon"
import type { ShownNotification } from "@/lib/push/queue"

interface ProximityBannerProps {
  notification: ShownNotification
  onOpen: () => void
  onDismiss: () => void
}

/** Aviso por cercanía arriba de la pantalla, con el formato de una notificación de iOS. */
export function ProximityBanner({ notification, onOpen, onDismiss }: ProximityBannerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto w-full max-w-md px-4">
      <article
        role="alert"
        className="animate-in fade-in slide-in-from-top-4 bg-card/95 pointer-events-auto flex items-start gap-3 rounded-[22px] p-3.5 shadow-[0_8px_30px_rgb(0_0_0/0.12)] backdrop-blur-xl duration-300"
      >
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left">
          <CategoryIcon category={notification.category ?? "Lugar"} className="size-10 shrink-0 rounded-[11px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate text-[15px] font-semibold">{notification.placeName ?? "Cerca tuyo"}</h3>
              <span className="text-muted-foreground shrink-0 text-[13px]">ahora</span>
            </div>
            <p className="text-[15px] leading-snug">{notification.reason}</p>
            <p className="text-muted-foreground mt-0.5 text-[13px]">Tocá para preguntarle a Polo</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="text-muted-foreground hover:bg-muted -mt-1 -mr-1 rounded-full p-1.5"
        >
          <XIcon className="size-4" />
        </button>
      </article>
    </div>
  )
}
