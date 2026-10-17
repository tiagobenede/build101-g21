"use client"

import { CheckIcon } from "lucide-react"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { addItem } from "@/app/itinerary/actions"
import { CategoryIcon } from "@/components/rumbo/category-icon"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { clientNow } from "@/hooks/use-clock"
import { addMinutesIso, zonedTimeToIso, zonedTimeValue } from "@/lib/time/zoned"
import { cn } from "@/lib/utils"

export type PickablePlace = {
  id: string
  name: string
  category: string
  walkMinutes: number
  visitMinutes: number
}

interface AddItemDrawerProps {
  open: boolean
  places: PickablePlace[]
  timeZone: string
  today: string
  onClose: () => void
}

const MAX_PLACES = 8
const SLOT_MINUTES = 30

/** Próxima media hora en la zona del viaje ("16:30"). */
function nextSlot(timeZone: string): string {
  const now = clientNow().getTime()
  const rounded = Math.ceil(now / (SLOT_MINUTES * 60_000)) * SLOT_MINUTES * 60_000
  return zonedTimeValue(new Date(rounded).toISOString(), timeZone)
}

/** Hoja para sumar una actividad: un lugar cercano o algo escrito a mano. */
export function AddItemDrawer({ open, places, timeZone, today, onClose }: AddItemDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-md">
        {open && <AddForm places={places} timeZone={timeZone} today={today} onDone={onClose} />}
      </DrawerContent>
    </Drawer>
  )
}

function AddForm({ places, timeZone, today, onDone }: Omit<AddItemDrawerProps, "open" | "onClose"> & { onDone: () => void }) {
  const [mode, setMode] = useState<"place" | "text">(places.length > 0 ? "place" : "text")
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [start, setStart] = useState(() => nextSlot(timeZone))
  const [pending, startTransition] = useTransition()

  const options = places.slice(0, MAX_PLACES)
  const place = options.find((p) => p.id === placeId) ?? null
  const canSave = mode === "place" ? place !== null : title.trim().length > 0

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const startsAt = zonedTimeToIso(today, start, timeZone)
    startTransition(async () => {
      const res = await addItem({
        title: mode === "place" ? null : title,
        placeId: mode === "place" ? place!.id : null,
        startsAt,
        endsAt: mode === "place" ? addMinutesIso(startsAt, place!.visitMinutes) : null,
        notes: null,
        source: null,
        sourceRef: null,
        locked: null,
      })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Agregado a tu día.")
      onDone()
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <DrawerHeader className="px-0 text-left">
        <DrawerTitle>Sumar a hoy</DrawerTitle>
      </DrawerHeader>

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as "place" | "text")}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="place" className="flex-1">
          Lugar cercano
        </ToggleGroupItem>
        <ToggleGroupItem value="text" className="flex-1">
          Otra cosa
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "place" ? (
        <div className="bg-card max-h-64 overflow-y-auto rounded-2xl">
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlaceId(p.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left",
                p.id === placeId && "bg-brand/10"
              )}
            >
              <CategoryIcon category={p.category} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{p.name}</span>
                <span className="text-muted-foreground text-[13px]">
                  {p.walkMinutes} min a pie · ~{p.visitMinutes} min
                </span>
              </span>
              {p.id === placeId && <CheckIcon className="text-brand size-4" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-title">¿Qué vas a hacer?</Label>
          <Input
            id="new-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cena con amigos"
            maxLength={120}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-start">A qué hora</Label>
        <Input id="new-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
      </div>

      <Button type="submit" size="lg" className="h-12 rounded-full" disabled={!canSave || pending}>
        Agregar
      </Button>
    </form>
  )
}
