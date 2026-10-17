"use client"

import { BellIcon, CalendarCheckIcon, CalendarPlusIcon, NavigationIcon, QuoteIcon, Undo2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { addTipToItinerary, dismissTip, saveTip } from "@/app/tips/actions"
import { CategoryIcon } from "@/components/rumbo/category-icon"
import { Button } from "@/components/ui/button"
import { zonedTimeValue } from "@/lib/time/zoned"
import { planSlots, recommendedBy, type LocalTipView } from "@/lib/tips/view"
import { cn } from "@/lib/utils"

interface LocalTipCardProps {
  tip: LocalTipView
  timeZone: string
  /** Se avisa cuando cambia el estado (guardada, en el plan, descartada). */
  onChange?: (tip: LocalTipView) => void
  /** "Llevame": se lo pide al agente (muestra el camino y lo cuenta). */
  onGo?: (tip: LocalTipView) => void
  className?: string
}

/**
 * Lo que recomendó una persona local (B-5): qué, quién, la cita original y su
 * traducción, y qué hacer con eso. Las guardadas avisan al pasar cerca (C-6).
 */
export function LocalTipCard({ tip, timeZone, onChange, onGo, className }: LocalTipCardProps) {
  const [busy, setBusy] = useState(false)
  /** Horarios para "Al plan", calculados al tocarlo (no al dibujar). */
  const [slots, setSlots] = useState<string[] | null>(null)

  const update = (status: LocalTipView["status"]) => onChange?.({ ...tip, status })

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) => {
    setBusy(true)
    const res = await fn().catch(() => ({ ok: false, error: "No pude guardar el cambio." }))
    setBusy(false)
    if (!res.ok) return void toast.error(res.error ?? "No pude guardar el cambio.")
    onOk()
  }

  if (tip.status === "dismissed") {
    return (
      <div className={cn("bg-card/60 text-muted-foreground flex items-center justify-between rounded-[18px] px-3.5 py-2.5 text-[14px]", className)}>
        <span className="truncate">Descartaste {tip.placeName}</span>
        <Button size="sm" variant="ghost" className="h-8 rounded-full" disabled={busy} onClick={() => run(() => saveTip(tip.id), () => update("saved"))}>
          <Undo2Icon className="size-3.5" />
          Deshacer
        </Button>
      </div>
    )
  }

  return (
    <article className={cn("animate-in fade-in slide-in-from-bottom-2 bg-card flex flex-col gap-2.5 rounded-[22px] p-3.5 duration-300", className)}>
      <header className="flex items-start gap-3">
        <CategoryIcon category={tip.category ?? "Lugar"} className="size-10 shrink-0 rounded-[11px]" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] leading-tight font-semibold">{tip.placeName}</h3>
          <p className="text-muted-foreground text-[13px]">
            {[
              tip.category,
              tip.walkMinutes !== null && `${tip.walkMinutes} min a pie`,
              tip.stayMinutes !== null && `~${tip.stayMinutes} min de visita`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusPill tip={tip} />
      </header>

      <div>
        <p className="text-[15px] leading-snug">{tip.what}</p>
        {tip.why && <p className="text-muted-foreground mt-0.5 text-[14px] leading-snug">{tip.why}</p>}
        {(tip.whenToGo || tip.priceHint) && (
          <p className="text-muted-foreground mt-1 text-[13px]">{[tip.whenToGo, tip.priceHint].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      {(tip.originalQuote || tip.translatedQuote) && (
        <figure className="bg-muted/60 rounded-[14px] px-3 py-2">
          <QuoteIcon className="text-muted-foreground mb-1 size-3.5" />
          {tip.originalQuote && <blockquote className="text-[14px] leading-snug italic">{tip.originalQuote}</blockquote>}
          {tip.translatedQuote && tip.translatedQuote !== tip.originalQuote && (
            <p className="text-muted-foreground mt-0.5 text-[13px] leading-snug">{tip.translatedQuote}</p>
          )}
          <figcaption className="mt-1.5 text-[13px] font-medium">{recommendedBy(tip.recommender)}</figcaption>
        </figure>
      )}

      {!tip.placeId && (
        <p className="text-muted-foreground text-[13px]">No lo encontré en el mapa: pedile a Rumbo que lo busque.</p>
      )}

      {slots ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-[13px]">¿A qué hora?</span>
          {slots.map((iso) => (
            <Button
              key={iso}
              size="sm"
              variant="secondary"
              className="h-8 rounded-full"
              disabled={busy}
              onClick={() =>
                run(
                  () => addTipToItinerary(tip.id, iso),
                  () => {
                    setSlots(null)
                    update("in_plan")
                    toast.success(`${tip.placeName} quedó en tu plan a las ${zonedTimeValue(iso, timeZone)}.`)
                  }
                )
              }
            >
              {zonedTimeValue(iso, timeZone)}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setSlots(null)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className={cn("grid gap-2", onGo ? "grid-cols-3" : "grid-cols-2")}>
          <Button
            size="sm"
            className="h-9 rounded-full"
            disabled={busy || !tip.placeId || tip.status === "in_plan"}
            onClick={() => setSlots(planSlots(Date.now()))}
          >
            {tip.status === "in_plan" ? <CalendarCheckIcon className="size-3.5" /> : <CalendarPlusIcon className="size-3.5" />}
            {tip.status === "in_plan" ? "En el plan" : "Al plan"}
          </Button>
          {onGo && (
            <Button size="sm" variant="secondary" className="h-9 rounded-full" disabled={!tip.placeId} onClick={() => onGo(tip)}>
              <NavigationIcon className="size-3.5" />
              Llevame
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-9 rounded-full"
            disabled={busy}
            onClick={() => run(() => dismissTip(tip.id), () => update("dismissed"))}
          >
            <XIcon className="size-3.5" />
            Descartar
          </Button>
        </div>
      )}
    </article>
  )
}

function StatusPill({ tip }: { tip: LocalTipView }) {
  if (tip.status === "in_plan")
    return <span className="bg-brand/10 text-brand shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">En tu plan</span>
  if (tip.status === "saved" && tip.placeId)
    return (
      <span className="shrink-0 rounded-full bg-[#34C759]/12 px-2 py-0.5 text-[11px] font-semibold text-[#248A3D]" title="Te aviso cuando pases cerca">
        <BellIcon className="mr-0.5 inline size-3 align-[-2px]" />
        Te aviso
      </span>
    )
  return null
}
