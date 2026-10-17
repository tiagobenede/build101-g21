"use client"

import { BellIcon, CalendarCheckIcon, CalendarPlusIcon, NavigationIcon, Undo2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { addTipToItinerary, dismissTip, saveTip } from "@/app/tips/actions"
import { NotificationCard } from "@/components/rumbo/place-notification"
import { Button } from "@/components/ui/button"
import { zonedTimeValue } from "@/lib/time/zoned"
import { planSlots, splitRecommender, type LocalTipView } from "@/lib/tips/view"
import { cn } from "@/lib/utils"

interface LocalTipCardProps {
  tip: LocalTipView
  timeZone: string
  /** Se avisa cuando cambia el estado (agendada, descartada, recuperada). */
  onChange?: (tip: LocalTipView) => void
  /** "Llevame": se lo pide al agente (muestra el camino y lo cuenta). Sin esto, no hay botón. */
  onGo?: (tip: LocalTipView) => void
  className?: string
}

const ACTION = "h-8 rounded-full px-3 text-[13px]"

/**
 * Lo que recomendó una persona local (B-5), con la misma card que los lugares que nombra
 * el agente en la llamada: lugar, quién lo recomendó, qué y a cuánto queda. Toda
 * recomendación no descartada queda guardada y avisa al pasar cerca (C-6).
 */
export function LocalTipCard({ tip, timeZone, onChange, onGo, className }: LocalTipCardProps) {
  const [busy, setBusy] = useState(false)
  /** Horarios para "Agendar", calculados al tocarlo (no al dibujar). */
  const [slots, setSlots] = useState<string[] | null>(null)
  const who = splitRecommender(tip.recommender).name

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) => {
    setBusy(true)
    const res = await fn().catch(() => ({ ok: false, error: "No pude guardar el cambio." }))
    setBusy(false)
    if (!res.ok) return void toast.error(res.error ?? "No pude guardar el cambio.")
    onOk()
  }

  if (tip.status === "dismissed") {
    return (
      <div className={cn("bg-card/60 text-muted-foreground flex items-center justify-between gap-2 rounded-[18px] py-1.5 pr-1.5 pl-3.5 text-[13px]", className)}>
        <span className="truncate">Descartaste {tip.placeName}</span>
        <Button
          size="sm"
          variant="ghost"
          className={cn(ACTION, "shrink-0")}
          disabled={busy}
          onClick={() => run(() => saveTip(tip.id), () => onChange?.({ ...tip, status: "saved" }))}
        >
          <Undo2Icon className="size-3.5" />
          Deshacer
        </Button>
      </div>
    )
  }

  const scheduled = tip.status === "in_plan"
  const facts = [who ? `Te lo recomendó ${who}` : "Te lo recomendaron", tip.walkMinutes !== null && `${tip.walkMinutes} min a pie`]
    .filter(Boolean)
    .join(" · ")

  return (
    <NotificationCard
      className={className}
      category={tip.category ?? "Lugar"}
      title={tip.placeName}
      trailing={
        !tip.placeId ? null : scheduled ? (
          <span className="text-brand inline-flex items-center gap-1 font-medium">
            <CalendarCheckIcon className="size-3.5" />
            Agendado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-[#248A3D]" title="Te aviso cuando pases cerca">
            <BellIcon className="size-3.5" />
            Te aviso
          </span>
        )
      }
      actions={
        slots ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-0.5 text-[13px]">¿A qué hora?</span>
            {slots.map((iso) => (
              <Button
                key={iso}
                size="sm"
                variant="secondary"
                className={cn(ACTION, "tabular-nums")}
                disabled={busy}
                onClick={() =>
                  run(
                    () => addTipToItinerary(tip.id, iso),
                    () => {
                      setSlots(null)
                      onChange?.({ ...tip, status: "in_plan" })
                      toast.success(`${tip.placeName} quedó agendado a las ${zonedTimeValue(iso, timeZone)}.`)
                    }
                  )
                }
              >
                {zonedTimeValue(iso, timeZone)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" className={cn(ACTION, "ml-auto")} onClick={() => setSlots(null)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {tip.placeId && !scheduled && (
              <Button size="sm" className={ACTION} disabled={busy} onClick={() => setSlots(planSlots(Date.now()))}>
                <CalendarPlusIcon className="size-3.5" />
                Agendar
              </Button>
            )}
            {tip.placeId && onGo && (
              <Button size="sm" variant="secondary" className={ACTION} onClick={() => onGo(tip)}>
                <NavigationIcon className="size-3.5" />
                Llevame
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={cn(ACTION, "text-muted-foreground ml-auto")}
              disabled={busy}
              onClick={() => run(() => dismissTip(tip.id), () => onChange?.({ ...tip, status: "dismissed" }))}
            >
              <XIcon className="size-3.5" />
              Descartar
            </Button>
          </div>
        )
      }
    >
      <p className="text-[15px] leading-snug">{facts}</p>
      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[13px] leading-snug">
        {tip.placeId ? tip.what : "No lo encontré en el mapa: pedile a Rumbo que lo busque."}
      </p>
    </NotificationCard>
  )
}
