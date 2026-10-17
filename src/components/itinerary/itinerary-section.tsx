"use client"

import { CheckIcon, LockIcon, PlusIcon, RotateCcwIcon, SparklesIcon, UsersIcon, TicketIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setItemStatus, undo } from "@/app/itinerary/actions"
import { GroupedList, Section } from "@/components/rumbo/section"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useCompanionActivity } from "@/hooks/use-companion-activity"
import { useTableRefresh } from "@/hooks/use-table-refresh"
import type { ItineraryItem } from "@/lib/data/session"
import { zonedTimeValue } from "@/lib/time/zoned"
import { cn } from "@/lib/utils"

import { AddItemDrawer, type PickablePlace } from "./add-item-drawer"
import { EditItemDrawer } from "./edit-item-drawer"

interface ItinerarySectionProps {
  items: ItineraryItem[]
  places: PickablePlace[]
  timeZone: string
  /** "YYYY-MM-DD" de hoy en la zona del viaje. */
  today: string
  /** Viaje compartido: nombre de cada compañero por id, para "Lo sumó Sofía". */
  companionNames?: Record<string, string>
}

const NO_COMPANIONS: Record<string, string> = {}

const SOURCE_LABEL: Partial<Record<ItineraryItem["source"], { text: string; icon: typeof SparklesIcon }>> = {
  agent: { text: "Lo sumó Rumbo", icon: SparklesIcon },
  local_tip: { text: "Recomendación local", icon: UsersIcon },
  event: { text: "Evento", icon: TicketIcon },
}

/** Itinerario de hoy en la home: marcar hecho, editar, agregar, deshacer. Se actualiza solo (Realtime). */
export function ItinerarySection({ items, places, timeZone, today, companionNames = NO_COMPANIONS }: ItinerarySectionProps) {
  useTableRefresh("itinerary_items")
  useCompanionActivity(companionNames)
  const [editing, setEditing] = useState<ItineraryItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) =>
    startTransition(async () => {
      const res = await action()
      if (!res.ok) toast.error(res.error)
      else if (success) toast.success(success)
    })

  return (
    <Section
      title="Hoy"
      action={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground rounded-full"
            aria-label="Deshacer el último cambio"
            disabled={pending}
            onClick={() => run(undo, "Listo, volví al plan anterior.")}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-brand rounded-full"
            aria-label="Agregar actividad"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-5" />
          </Button>
        </div>
      }
    >
      {items.length === 0 ? (
        <GroupedList>
          <button type="button" className="text-muted-foreground px-4 py-6 text-center text-[15px]" onClick={() => setAdding(true)}>
            No tenés nada para hoy. Tocá + para sumar algo.
          </button>
        </GroupedList>
      ) : (
        <GroupedList>
          {items.map((item) => (
            <ItineraryRow
              key={item.id}
              item={item}
              addedBy={item.created_by ? (companionNames[item.created_by] ?? null) : null}
              timeZone={timeZone}
              disabled={pending}
              onToggleDone={() => run(() => setItemStatus(item.id, item.status === "done" ? "planned" : "done"))}
              onOpen={() => setEditing(item)}
            />
          ))}
        </GroupedList>
      )}

      <EditItemDrawer item={editing} timeZone={timeZone} today={today} onClose={() => setEditing(null)} />
      <AddItemDrawer open={adding} places={places} timeZone={timeZone} today={today} onClose={() => setAdding(false)} />
    </Section>
  )
}

interface ItineraryRowProps {
  item: ItineraryItem
  /** Quién la sumó, si fue otra persona del viaje. */
  addedBy: string | null
  timeZone: string
  disabled: boolean
  onToggleDone: () => void
  onOpen: () => void
}

function ItineraryRow({ item, addedBy, timeZone, disabled, onToggleDone, onOpen }: ItineraryRowProps) {
  const done = item.status === "done"
  const skipped = item.status === "skipped"
  const source = addedBy ? { text: `Lo sumó ${addedBy}`, icon: UsersIcon } : SOURCE_LABEL[item.source]
  const details = [skipped ? "Salteada" : null, item.notes].filter(Boolean).join(" · ")

  return (
    <Item className="rounded-none px-4 py-3">
      <ItemMedia>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleDone}
          aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
          aria-pressed={done}
          className={cn(
            "flex size-6 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
            done ? "border-[#34C759] bg-[#34C759] text-white" : "border-muted-foreground/40 hover:border-[#34C759]"
          )}
        >
          {done && <CheckIcon className="size-3.5" strokeWidth={3} />}
        </button>
      </ItemMedia>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
        <span className={cn("w-12 shrink-0 text-[15px] font-semibold tabular-nums", (done || skipped) && "text-muted-foreground")}>
          {zonedTimeValue(item.starts_at, timeZone)}
        </span>
        <ItemContent className="min-w-0">
          <ItemTitle className={cn("text-[15px]", done && "text-muted-foreground line-through", skipped && "text-muted-foreground")}>
            {item.title}
          </ItemTitle>
          {(details || source) && (
            <ItemDescription className="flex items-center gap-1 truncate text-[13px]">
              {source && (
                <span className="text-brand inline-flex shrink-0 items-center gap-1">
                  <source.icon className="size-3" />
                  {source.text}
                </span>
              )}
              {source && details && <span>·</span>}
              {details && <span className="truncate">{details}</span>}
            </ItemDescription>
          )}
        </ItemContent>
      </button>
      {item.locked && (
        <ItemActions>
          <LockIcon className="text-muted-foreground size-4" aria-label="Reserva" />
        </ItemActions>
      )}
    </Item>
  )
}
