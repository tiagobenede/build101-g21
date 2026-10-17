"use client"

import { ChevronLeftIcon, KeyboardIcon, MicIcon, SendIcon, SquareIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { CategoryIcon } from "@/components/rumbo/category-icon"
import { VoiceOrb } from "@/components/rumbo/voice-orb"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useVoiceSession, type Turn, type VoiceState } from "@/hooks/use-voice-session"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<VoiceState, string> = {
  idle: "Tocá el micrófono para hablar",
  listening: "Escuchando…",
  thinking: "Pensando…",
  talking: "Hablando",
}

interface TalkClientProps {
  firstName: string
  locationLabel: string
  suggestions: string[]
}

export function TalkClient({ firstName, locationLabel, suggestions }: TalkClientProps) {
  const session = useVoiceSession()
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { state, turns } = session
  const hasTurns = turns.length > 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [turns.length, session.revealed, session.interim])

  const onMic = () => {
    if (state === "listening") return session.stopListening()
    if (state === "talking") return session.interrupt()
    void session.listen()
  }

  return (
    <main className="bg-card flex h-dvh flex-col overflow-hidden">
      <header className="mx-auto grid w-full max-w-md grid-cols-[40px_1fr_40px] items-center px-3 pt-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="Volver">
          <Link href="/">
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
        <div className="text-center">
          <p className="text-[15px] font-semibold">Rumbo</p>
          <p className="text-muted-foreground text-xs">{STATUS_LABEL[state]}</p>
        </div>
        <span />
      </header>

      <section
        className={cn(
          "mx-auto flex w-full max-w-md shrink-0 items-center justify-center transition-[height] duration-500 ease-out",
          hasTurns ? "h-40" : "h-[46dvh]"
        )}
      >
        <VoiceOrb
          state={state}
          inputVolumeRef={session.inputVolumeRef}
          outputVolumeRef={session.outputVolumeRef}
          className={cn("transition-[width] duration-500 ease-out", hasTurns ? "w-28" : "w-60")}
        />
      </section>

      <div ref={scrollRef} className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 pb-4">
        {!hasTurns && (
          <div className="animate-in fade-in text-center duration-500">
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
              Hola {firstName}, ¿cuánto tiempo tenés?
            </h1>
            <p className="text-muted-foreground mt-2 text-[15px]">Estás cerca de {locationLabel}</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {turns.map((turn, i) => (
            <TurnView
              key={turn.id}
              turn={turn}
              revealed={i === turns.length - 1 ? session.revealed : Number.MAX_SAFE_INTEGER}
            />
          ))}
          {state === "listening" && (
            <p className="bg-secondary text-muted-foreground max-w-[80%] self-end rounded-[18px] px-3.5 py-2 text-[15px]">
              {session.interim || "…"}
            </p>
          )}
          {state === "thinking" && <ThinkingDots />}
        </div>
      </div>

      <footer className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {state === "idle" && !typing && (
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {suggestions.map((s) => (
              <Button
                key={s}
                variant="secondary"
                className="h-9 shrink-0 rounded-full px-4 text-[14px] font-normal"
                onClick={() => void session.send(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}

        {typing ? (
          <TextComposer
            disabled={state === "thinking"}
            onSend={(text) => void session.send(text)}
            onClose={() => setTyping(false)}
          />
        ) : (
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="secondary"
              size="icon"
              className="size-12 rounded-full"
              aria-label="Escribir"
              onClick={() => setTyping(true)}
            >
              <KeyboardIcon className="size-5" />
            </Button>

            <Button
              onClick={onMic}
              disabled={state === "thinking"}
              aria-label={state === "listening" ? "Terminar de hablar" : "Hablar"}
              className={cn(
                "size-16 rounded-full shadow-sm transition-colors",
                state === "listening" && "bg-brand hover:bg-brand/90"
              )}
            >
              {state === "listening" || state === "talking" ? (
                <SquareIcon className="size-5 fill-current" />
              ) : (
                <MicIcon className="size-6" />
              )}
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="size-12 rounded-full"
              aria-label={session.muted ? "Activar voz" : "Silenciar voz"}
              onClick={() => session.setMuted(!session.muted)}
            >
              {session.muted ? <VolumeXIcon className="size-5" /> : <Volume2Icon className="size-5" />}
            </Button>
          </div>
        )}
      </footer>
    </main>
  )
}

function TurnView({ turn, revealed }: { turn: Turn; revealed: number }) {
  if (turn.role === "user") {
    return (
      <p className="bg-secondary animate-in fade-in max-w-[80%] self-end rounded-[18px] px-3.5 py-2 text-[15px] duration-200">
        {turn.text}
      </p>
    )
  }

  const pending = turn.text.slice(revealed)
  const done = pending.length === 0

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[17px] leading-relaxed text-pretty">
        {turn.text.slice(0, revealed)}
        <span className="text-muted-foreground/40">{pending}</span>
      </p>
      {done && turn.recommendations.length > 0 && (
        <Card className="animate-in fade-in slide-in-from-bottom-1 gap-0 rounded-2xl py-0 shadow-none duration-300 [&>[data-slot=item]:not(:last-child)]:border-b-border">
          {turn.recommendations.map((rec) => (
            <Item key={rec.id} className="rounded-none px-4 py-3">
              <ItemMedia>
                <CategoryIcon category={rec.category} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-[15px]">{rec.name}</ItemTitle>
                <ItemDescription className="text-[13px]">
                  {rec.walkMinutes} min a pie · ~{rec.stayMinutes} min de visita
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </Card>
      )}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1.5 py-2" aria-label="Pensando">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/50 size-2 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}

interface TextComposerProps {
  disabled: boolean
  onSend: (text: string) => void
  onClose: () => void
}

function TextComposer({ disabled, onSend, onClose }: TextComposerProps) {
  const [value, setValue] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    onSend(value)
    setValue("")
  }

  return (
    <form onSubmit={submit} className="bg-secondary flex items-center gap-1 rounded-full p-1">
      <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Usar voz" onClick={onClose}>
        <MicIcon />
      </Button>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tengo 30 minutos…"
        maxLength={500}
        className="border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="icon" className="rounded-full" disabled={disabled || !value.trim()} aria-label="Enviar">
        <SendIcon />
      </Button>
    </form>
  )
}
