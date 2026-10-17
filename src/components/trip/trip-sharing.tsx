"use client"

import { CopyIcon, LogOutIcon, UserPlusIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createTripInvite, joinTripWithCode, leaveCurrentTrip } from "@/app/trip/actions"
import { GroupedList, Section } from "@/components/rumbo/section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useTableRefresh } from "@/hooks/use-table-refresh"
import { cn } from "@/lib/utils"

export type TripPerson = { userId: string; name: string; note: string | null; isOwner: boolean; isMe: boolean }

interface TripSharingProps {
  people: TripPerson[]
  /** Si el viaje es mío (el dueño no puede salir; los demás sí). */
  isOwner: boolean
}

const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()

/**
 * Viaje compartido: quién viaja, invitar con un código y sumarse a otro viaje.
 * Cada uno habla con Rumbo desde su teléfono; el plan es uno solo.
 */
export function TripSharing({ people, isOwner }: TripSharingProps) {
  useTableRefresh("trip_members")
  const [invite, setInvite] = useState<{ code: string; link: string } | null>(null)
  const [code, setCode] = useState("")
  const [pending, startTransition] = useTransition()

  const createInvite = () =>
    startTransition(async () => {
      const r = await createTripInvite()
      if (!r.ok) return void toast.error(r.error)
      setInvite({ code: r.data.code, link: `${window.location.origin}/join/${r.data.code}` })
    })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copiado.")
    } catch {
      toast.error("No pude copiar: pasalo a mano.")
    }
  }

  const join = () =>
    startTransition(async () => {
      const r = await joinTripWithCode(code)
      if (!r.ok) return void toast.error(r.error)
      setCode("")
      toast.success("Listo, ya están en el mismo viaje.")
    })

  const leave = () =>
    startTransition(async () => {
      const r = await leaveCurrentTrip()
      if (!r.ok) return void toast.error(r.error)
      toast.success("Saliste del viaje compartido.")
    })

  return (
    <Section title="Viajan juntos">
      <GroupedList>
        {people.map((p) => (
          <Item key={p.userId} className="rounded-none px-4 py-3">
            <ItemMedia>
              <span className="bg-brand flex size-9 items-center justify-center rounded-full text-[13px] font-semibold text-white">
                {initials(p.name)}
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-[15px]">
                {p.name}
                {p.isMe && <span className="text-muted-foreground font-normal"> (vos)</span>}
              </ItemTitle>
              <ItemDescription className="text-[13px]">
                {[p.isOwner ? "Armó el viaje" : null, p.note].filter(Boolean).join(" · ") || "Se sumó al viaje"}
              </ItemDescription>
            </ItemContent>
            {p.isMe && !isOwner && (
              <ItemActions>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Salir del viaje" disabled={pending} onClick={leave}>
                  <LogOutIcon className="size-4" />
                </Button>
              </ItemActions>
            )}
          </Item>
        ))}

        <div className="flex flex-col gap-3 px-4 py-3">
          {invite ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-[13px]">Código para sumarse (vale 7 días)</p>
                <p className="text-2xl font-semibold tracking-[0.2em] tabular-nums">{invite.code}</p>
              </div>
              <Button variant="secondary" className="rounded-full" onClick={() => void copy(invite.link)}>
                <CopyIcon />
                Copiar link
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="h-11 rounded-full" disabled={pending} onClick={createInvite}>
              <UserPlusIcon />
              Invitar a alguien
            </Button>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) join()
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Código de otro viaje"
              maxLength={6}
              autoCapitalize="characters"
              className={cn("h-11 rounded-full px-4", code && "tracking-widest")}
              aria-label="Código de invitación"
            />
            <Button type="submit" className="h-11 rounded-full" disabled={pending || code.trim().length < 6}>
              Unirme
            </Button>
          </form>
        </div>
      </GroupedList>
    </Section>
  )
}
