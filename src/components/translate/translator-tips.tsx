"use client"

import { BellIcon, ChevronDownIcon, ChevronUpIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { ScrollFade } from "@/components/rumbo/scroll-fade"
import { Spinner } from "@/components/ui/spinner"
import type { LocalTipView } from "@/lib/tips/view"

import { LocalTipCard } from "./local-tip-card"

/** Estado de la revisión de lo que dijo la persona local (lo maneja /talk). */
export type TipScan = {
  /** Turnos que se están revisando ahora. */
  pending: number
  /** Qué salió la última revisión. */
  last: "found" | "none" | "error" | null
  /** Cambia en cada revisión terminada (para volver a mostrar el mensaje). */
  lastId: number
}

/** Cuánto queda a la vista "no te recomendó nada" o el error. */
const RESULT_MS = 6_000

interface TranslatorTipsProps {
  tips: LocalTipView[]
  scan: TipScan
  timeZone: string
  onChange: (tip: LocalTipView) => void
  onGo: (tip: LocalTipView) => void
}

/**
 * Debajo de la charla del traductor: lo que recomendó la persona local (B-5). Muestra
 * cuándo se está revisando lo que dijo, si no recomendó nada, y las cards. Las
 * recomendaciones se guardan solas y avisan al pasar cerca, salvo las que descartás.
 */
export function TranslatorTips({ tips, scan, timeZone, onChange, onGo }: TranslatorTipsProps) {
  /** Último resultado que ya se ocultó: el mensaje se muestra un rato y se va. */
  const [hiddenId, setHiddenId] = useState(0)
  useEffect(() => {
    if (scan.lastId === 0) return
    const timer = setTimeout(() => setHiddenId(scan.lastId), RESULT_MS)
    return () => clearTimeout(timer)
  }, [scan.lastId])

  const scanning = scan.pending > 0
  const showResult = !scanning && scan.lastId !== hiddenId && (scan.last === "none" || scan.last === "error")
  const active = tips.filter((t) => t.status !== "dismissed")

  /**
   * Plegada para que la charla tenga lugar. Se guarda cuántas había al plegarla: si
   * llega una nueva, se abre sola para que se vea.
   */
  const [collapsedAt, setCollapsedAt] = useState<number | null>(null)
  const open = collapsedAt === null || tips.length > collapsedAt

  if (tips.length === 0 && !scanning && !showResult) return null

  return (
    <section aria-label="Recomendaciones" className="flex max-h-[42%] min-h-0 shrink-0 flex-col gap-2 pt-1">
      {tips.length > 0 &&
        (open ? (
          <header className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">
                Te recomendaron{active.length > 0 && <span className="text-muted-foreground font-normal"> · {active.length}</span>}
              </h2>
              <p className="text-muted-foreground flex items-center gap-1 truncate text-[12px]">
                <BellIcon className="size-3 shrink-0" />
                Se guardan solas · te aviso al pasar cerca
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsedAt(tips.length)}
              className="text-muted-foreground bg-card inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium"
              aria-expanded
            >
              Ocultar
              <ChevronDownIcon className="size-3.5" />
            </button>
          </header>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsedAt(null)}
            aria-expanded={false}
            className="bg-card flex w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left"
          >
            <BellIcon className="size-4 shrink-0 text-[#248A3D]" />
            <span className="shrink-0 text-[15px] font-semibold">Te recomendaron · {active.length}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">{active.map((t) => t.placeName).join(", ")}</span>
            <ChevronUpIcon className="text-muted-foreground size-4 shrink-0" />
          </button>
        ))}

      {scanning && (
        <StatusRow>
          <Spinner className="size-4" />
          Revisando si te recomendó algún lugar…
        </StatusRow>
      )}
      {showResult && scan.last === "none" && (
        <StatusRow muted>
          <SearchXIcon className="size-4" />
          En lo último que dijo no hubo ninguna recomendación concreta.
        </StatusRow>
      )}
      {showResult && scan.last === "error" && (
        <StatusRow muted>
          <TriangleAlertIcon className="size-4" />
          No pude revisar lo que dijo. Si te recomendó algo, pedíselo a Polo.
        </StatusRow>
      )}

      {tips.length > 0 && open && (
        <ScrollFade className="min-h-0">
          <div className="flex flex-col gap-2 pb-2">
            {tips.map((tip) => (
              <LocalTipCard key={tip.id} tip={tip} timeZone={timeZone} onChange={onChange} onGo={onGo} />
            ))}
          </div>
        </ScrollFade>
      )}
    </section>
  )
}

function StatusRow({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      role="status"
      className={`animate-in fade-in bg-card flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-[14px] duration-200 ${muted ? "text-muted-foreground" : ""}`}
    >
      {children}
    </p>
  )
}
