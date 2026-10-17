"use client"

import { ArrowLeftRightIcon, MicIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ScrollFade } from "@/components/rumbo/scroll-fade"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useTranslator, type TranslatorState } from "@/hooks/use-translator"
import type { LatLng } from "@/lib/geo"
import { LANG_CODES, LANGUAGES, type Lang, type Speaker } from "@/lib/translate/config"
import type { Utterance } from "@/lib/translate/utterances"
import { cn } from "@/lib/utils"

const STATUS: Record<TranslatorState, string> = {
  off: "Usá auriculares si podés: así no se traduce a sí mismo.",
  ready: "Apretá quien va a hablar. No se cobra hasta que alguien habla.",
  connecting: "Conectando…",
  listening: "Hablá ahora · tocá de nuevo al terminar",
  finishing: "Terminando de traducir…",
}

interface TranslatorPanelProps {
  location: LatLng
  onTurn: (turn: Utterance, recent: Utterance[], conversationId: string, theirLang: Lang) => void
  onExit: () => void
  /** Lo que se muestra debajo de la charla (la UI generativa con lo que recomendaron). */
  children?: React.ReactNode
}

/**
 * Modo traductor dentro de la pantalla del agente: la charla con la persona local
 * arriba, lo que recomienda abajo (UI generativa) y los botones de quién habla.
 * Al desmontarse corta todo (nada queda cobrando).
 */
export function TranslatorPanel({ location, onTurn, onExit, children }: TranslatorPanelProps) {
  const [myLang, setMyLang] = useState<Lang>("es")
  const [theirLang, setTheirLang] = useState<Lang>("fr")
  const t = useTranslator({
    myLang,
    theirLang,
    location,
    onTurn: (turn, recent, conversationId) => onTurn(turn, recent, conversationId, theirLang),
  })
  const busy = t.state === "connecting" || t.state === "listening" || t.state === "finishing"
  const { start } = t
  useEffect(() => {
    void start()
  }, [start])

  // La charla siempre muestra lo último.
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [t.utterances])

  return (
    <>
      <section className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-2 px-4 pt-3">
        <div className="flex items-end gap-2">
          <LangSelect label="Yo hablo" value={myLang} onChange={setMyLang} disabled={busy} />
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Invertir idiomas"
            disabled={busy}
            onClick={() => {
              setMyLang(theirLang)
              setTheirLang(myLang)
            }}
          >
            <ArrowLeftRightIcon className="size-4" />
          </Button>
          <LangSelect label="Habla" value={theirLang} onChange={setTheirLang} disabled={busy} />
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Cerrar traductor" onClick={onExit}>
            <XIcon className="size-5" />
          </Button>
        </div>

        <ScrollFade className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 py-2">
            {t.utterances.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-[15px]">Lo que te recomienden aparece abajo y Rumbo se acuerda.</p>
            )}
            {t.utterances.map((u) => (
              <div
                key={u.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2",
                  u.speaker === "me" ? "bg-brand self-end text-white" : "bg-card self-start",
                  !u.final && "opacity-70"
                )}
              >
                <p className="text-[17px] leading-snug">{u.translated || "…"}</p>
                {u.original && <p className="mt-1 text-xs opacity-75">{u.original}</p>}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </ScrollFade>
        {children}
      </section>

      <footer className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground mb-3 text-center text-[13px]">
          {STATUS[t.state]}
          {t.spentUsd > 0 && <span className="tabular-nums"> · US${t.spentUsd.toFixed(3)}</span>}
        </p>
        <div className="flex items-center gap-3">
          <SpeakButton who="me" label={`Hablo yo · ${LANGUAGES[myLang]}`} t={t} />
          <SpeakButton who="them" label={`Habla · ${LANGUAGES[theirLang]}`} t={t} />
        </div>
      </footer>
    </>
  )
}

function SpeakButton({ who, label, t }: { who: Speaker; label: string; t: ReturnType<typeof useTranslator> }) {
  const active = t.speaker === who
  return (
    <Button
      size="lg"
      variant={active ? "default" : "secondary"}
      aria-pressed={active}
      disabled={t.state === "off"}
      className={cn("h-14 flex-1 rounded-full text-[15px]", !active && "bg-card")}
      onClick={() => void t.press(who)}
    >
      {active && t.state === "connecting" ? <Spinner className="size-4" /> : <MicIcon className="size-4" />}
      {label}
    </Button>
  )
}

function LangSelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: Lang
  onChange: (lang: Lang) => void
  disabled: boolean
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="bg-card h-10 rounded-xl px-3 text-[15px]"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Lang)}
      >
        {LANG_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGES[code]}
          </option>
        ))}
      </select>
    </label>
  )
}
