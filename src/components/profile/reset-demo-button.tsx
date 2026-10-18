"use client"

import { ChevronRightIcon, RotateCcwIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { resetDemo } from "@/app/profile/actions"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"

/** Vuelve las cuentas demo a como arrancan, para ensayar la demo de cero. */
export function ResetDemoButton() {
  const [pending, startTransition] = useTransition()

  const reset = () => {
    if (!window.confirm("¿Reiniciar la demo? Se borran charlas, avisos y cambios al plan de todas las cuentas demo, y se cierra la sesión.")) return
    startTransition(async () => {
      // Si sale bien, redirige al login; si no, vuelve con el error.
      const r = await resetDemo()
      if (!r.ok) toast.error(r.error)
    })
  }

  return (
    <Item asChild className="w-full rounded-none px-4 py-3 text-left hover:bg-muted/60">
      <button type="button" onClick={reset} disabled={pending} className="disabled:cursor-wait">
        <ItemMedia>
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#FF9500] text-white">
            <RotateCcwIcon className="size-[18px]" />
          </span>
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="text-[15px]">Reiniciar demo</ItemTitle>
          <ItemDescription className="text-[13px]">Todas las cuentas demo vuelven a como arrancan</ItemDescription>
        </ItemContent>
        <ItemActions>
          {pending ? <Spinner className="text-muted-foreground" /> : <ChevronRightIcon className="text-muted-foreground/60 size-4" />}
        </ItemActions>
      </button>
    </Item>
  )
}
