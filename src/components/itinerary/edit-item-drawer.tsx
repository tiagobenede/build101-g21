"use client"

import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { removeItem, setItemStatus, updateItem } from "@/app/itinerary/actions"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ItineraryItem } from "@/lib/data/session"
import { zonedDateKey, zonedTimeToIso, zonedTimeValue } from "@/lib/time/zoned"

interface EditItemDrawerProps {
  item: ItineraryItem | null
  timeZone: string
  today: string
  onClose: () => void
}

/** Hoja para editar una actividad: horario, nombre y notas; saltear o borrar. */
export function EditItemDrawer({ item, timeZone, today, onClose }: EditItemDrawerProps) {
  return (
    <Drawer open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-w-md">
        {item && <EditForm key={item.id} item={item} timeZone={timeZone} today={today} onDone={onClose} />}
      </DrawerContent>
    </Drawer>
  )
}

function EditForm({ item, timeZone, today, onDone }: { item: ItineraryItem; timeZone: string; today: string; onDone: () => void }) {
  const [title, setTitle] = useState(item.title)
  const [start, setStart] = useState(zonedTimeValue(item.starts_at, timeZone))
  const [end, setEnd] = useState(item.ends_at ? zonedTimeValue(item.ends_at, timeZone) : "")
  const [notes, setNotes] = useState(item.notes ?? "")
  const [pending, startTransition] = useTransition()
  const day = zonedDateKey(new Date(item.starts_at), timeZone) || today

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      const res = await action()
      if (!res.ok) return void toast.error(res.error)
      onDone()
    })

  const save = (e: FormEvent) => {
    e.preventDefault()
    run(() =>
      updateItem(item.id, {
        title,
        startsAt: zonedTimeToIso(day, start, timeZone),
        endsAt: end ? zonedTimeToIso(day, end, timeZone) : null,
        notes: notes.trim() || null,
      })
    )
  }

  const skipped = item.status === "skipped"

  return (
    <form onSubmit={save} className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <DrawerHeader className="px-0 text-left">
        <DrawerTitle>Editar actividad</DrawerTitle>
        {item.locked && <DrawerDescription>Es una reserva: el agente no la mueve, vos sí podés.</DrawerDescription>}
      </DrawerHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Nombre</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start">Empieza</Label>
          <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end">Termina</Label>
          <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </div>

      <Button type="submit" size="lg" className="h-12 rounded-full" disabled={pending}>
        Guardar
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="secondary"
          className="h-11 rounded-full"
          disabled={pending}
          onClick={() => run(() => setItemStatus(item.id, skipped ? "planned" : "skipped"))}
        >
          {skipped ? "Volver a pendiente" : "Saltear"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 rounded-full text-[#FF3B30]"
          disabled={pending}
          onClick={() => run(() => removeItem(item.id))}
        >
          Borrar
        </Button>
      </div>
    </form>
  )
}
