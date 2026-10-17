"use client"

import { BellIcon, BellOffIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { currentPushState, disablePush, enablePush, type PushState } from "@/lib/push/browser"

const DESCRIPTION: Record<PushState, string> = {
  unsupported: "Este navegador no permite notificaciones push.",
  denied: "Están bloqueadas: habilitalas en la configuración del navegador.",
  off: "Te avisa cuando pasás cerca de algo, aunque Rumbo esté en segundo plano.",
  on: "Activados en este navegador.",
}

/** Activar o desactivar las notificaciones push de avisos por cercanía en este navegador. */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void currentPushState().then(setState)
  }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      const next = state === "on" ? await disablePush() : await enablePush()
      setState(next)
      if (next === "on") toast.success("Listo: te aviso cuando pases cerca de algo.")
      if (next === "denied") toast.error("El navegador bloqueó las notificaciones.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pude cambiar los avisos.")
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return null
  const on = state === "on"
  return (
    <Item className="rounded-none px-4 py-3">
      <ItemMedia>
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#FF3B30] text-white">
          {on ? <BellIcon className="size-[18px]" /> : <BellOffIcon className="size-[18px]" />}
        </span>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-[15px]">Avisos cerca tuyo</ItemTitle>
        <ItemDescription className="text-[13px]">{DESCRIPTION[state]}</ItemDescription>
      </ItemContent>
      {(state === "off" || on) && (
        <ItemActions>
          <Button size="sm" variant={on ? "secondary" : "default"} className="rounded-full" disabled={busy} onClick={toggle}>
            {on ? "Desactivar" : "Activar"}
          </Button>
        </ItemActions>
      )}
    </Item>
  )
}
