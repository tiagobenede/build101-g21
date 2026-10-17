"use client"

import { ArrowLeftRightIcon, ChevronLeftIcon, MicIcon, SquareIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { useLocation } from "@/components/location/location-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useTranslator, type TranslatorState } from "@/hooks/use-translator"
import { LANG_CODES, LANGUAGES, type Lang, type Speaker } from "@/lib/translate/config"
import { cn } from "@/lib/utils"

const STATUS: Record<TranslatorState, string> = {
  off: "Usá auriculares si podés: así no se traduce a sí mismo.",
  ready: "Listo. No se cobra nada hasta que alguien aprieta para hablar.",
  connecting: "Conectando…",
  listening: "Hablá ahora",
  finishing: "Terminando de traducir…",
}

/**
 * Pantalla mínima del traductor (A-5). La versión final con burbujas es de B-5:
 * todo el estado viene de `useTranslator`.
 */
export function TranslateClient() {
  const { position } = useLocation()
  const [myLang, setMyLang] = useState<Lang>("es")
  const [theirLang, setTheirLang] = useState<Lang>("fr")
  const t = useTranslator({ myLang, theirLang, location: position })
  const on = t.state !== "off"
  const busy = t.state === "connecting" || t.state === "listening" || t.state === "finishing"

  return (
    <main className="flex h-dvh flex-col">
      <header className="mx-auto grid w-full max-w-md grid-cols-[40px_1fr_40px] items-center px-3 pt-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Volver">
          <Link href="/">
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
        <div className="text-center">
          <p className="text-[15px] font-semibold">Traductor</p>
          {t.spentUsd > 0 && <p className="text-muted-foreground text-xs tabular-nums">US${t.spentUsd.toFixed(3)}</p>}
        </div>
        {on && (
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Terminar" onClick={() => void t.stop()}>
            <SquareIcon className="size-4" />
          </Button>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pt-3">
        <LangSelect label="Yo hablo" value={myLang} onChange={setMyLang} disabled={busy} />
        <Button
          variant="ghost"
          size="icon"
          className="mt-5 rounded-full"
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
      </div>

      <section className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {t.utterances.map((u) => (
          <div
            key={u.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2",
              u.speaker === "me" ? "bg-brand self-end text-white" : "bg-muted self-start",
              !u.final && "opacity-70"
            )}
          >
            <p className="text-[17px] leading-snug">{u.translated || "…"}</p>
            {u.original && <p className="mt-1 text-xs opacity-75">{u.original}</p>}
          </div>
        ))}
      </section>

      <footer className="mx-auto w-full max-w-md px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground mb-3 text-center text-[13px]">{STATUS[t.state]}</p>
        {on ? (
          <div className="flex items-center gap-3">
            <SpeakButton who="me" label={`Hablo yo · ${LANGUAGES[myLang]}`} t={t} />
            <SpeakButton who="them" label={`Habla · ${LANGUAGES[theirLang]}`} t={t} />
          </div>
        ) : (
          <Button onClick={() => void t.start()} size="lg" className="h-14 w-full rounded-full text-base">
            <MicIcon className="size-5" />
            Empezar a traducir
          </Button>
        )}
      </footer>
    </main>
  )
}

function SpeakButton({ who, label, t }: { who: Speaker; label: string; t: ReturnType<typeof useTranslator> }) {
  const active = t.speaker === who
  return (
    <Button
      size="lg"
      variant={active ? "default" : "secondary"}
      aria-pressed={active}
      className="h-14 flex-1 rounded-full text-[15px]"
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
    <label className="flex flex-1 flex-col gap-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="bg-muted h-10 rounded-xl px-3 text-[15px]"
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
