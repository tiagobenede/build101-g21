"use client"

import { ArrowLeftRightIcon, CircleHelpIcon, Maximize2Icon, MicIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ScrollFade } from "@/components/rumbo/scroll-fade"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { localLanguageAt } from "@/app/talk/actions"
import { useTranslator, type TranslatorState } from "@/hooks/use-translator"
import type { LatLng } from "@/lib/geo"
import { LANG_CODES, LANGUAGES, type Lang, type Speaker } from "@/lib/translate/config"
import { installDevMic, speakIntoDevMic } from "@/lib/translate/dev-mic"
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
  /** Idioma con el que arranca la otra persona: el del país donde está el viajero. */
  defaultTheirLang: Lang
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
export function TranslatorPanel({ location, defaultTheirLang, onTurn, onExit, children }: TranslatorPanelProps) {
  const [myLang, setMyLang] = useState<Lang>("es")
  const [theirLang, setTheirLang] = useState<Lang>(defaultTheirLang)
  /** Si el viajero eligió el idioma a mano, no se lo pisa. */
  const chosenRef = useRef(false)
  const chooseTheirLang = (lang: Lang) => {
    chosenRef.current = true
    setTheirLang(lang)
  }
  // El idioma por defecto sale de la ubicación al cargar la página, que puede ser de antes
  // de moverse: al abrir se recalcula con la ubicación en vivo.
  const openedAtRef = useRef({ location, myLang })
  useEffect(() => {
    let alive = true
    const { location: here, myLang: mine } = openedAtRef.current
    void localLanguageAt(here, mine)
      .then((lang) => {
        if (alive && lang && !chosenRef.current) setTheirLang(lang)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  const t = useTranslator({
    myLang,
    theirLang,
    location,
    onTurn: (turn, recent, conversationId) => onTurn(turn, recent, conversationId, theirLang),
  })
  const busy = t.state === "connecting" || t.state === "listening" || t.state === "finishing"
  /** Frase a pantalla completa para que la lea la persona local (B-5). */
  const [shown, setShown] = useState<Utterance | null>(null)
  /** Las instrucciones se ven hasta que alguien habla; después quedan plegadas. */
  // Si el viajero ya las ocultó alguna vez, arrancan plegadas (se recuerda en este navegador).
  const [helpOpen, setHelpOpen] = useState(() => readHelpHidden() !== true)
  // Solo en desarrollo: simular la charla sin micrófono, por el mismo camino que un turno real
  // (window.rumboTranslatorSay("them", "Allez au Breizh Café…", "Vayan al Breizh Café…")).
  const { simulate } = t
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const w = window as unknown as { rumboTranslatorSay?: (who: Speaker, original: string, translated: string) => Promise<void> }
    w.rumboTranslatorSay = (who, original, translated) => {
      setHelpOpen(false)
      return simulate(who, original, translated)
    }
    return () => {
      delete w.rumboTranslatorSay
    }
  }, [simulate])

  const press = (who: Speaker) => {
    setHelpOpen(false)
    void t.press(who)
  }
  const { start, stop } = t

  // Solo en desarrollo: una charla de verdad (con traducción real) escribiendo en la consola.
  // rumboTranslatorTalk("me", "Hola, ¿dónde se puede comer bien?") aprieta el botón, lo dice
  // por un mic de mentira y suelta. El mic de mentira queda puesto hasta rumboDevMicOff().
  const stateRef = useRef(t.state)
  useEffect(() => {
    stateRef.current = t.state
  })
  const langsRef = useRef({ myLang, theirLang })
  useEffect(() => {
    langsRef.current = { myLang, theirLang }
  })
  const pressRef = useRef(t.press)
  useEffect(() => {
    pressRef.current = t.press
  })
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    if (readDevMic()) installDevMic()
    const until = async (ok: (s: TranslatorState) => boolean, ms: number) => {
      for (const end = Date.now() + ms; !ok(stateRef.current); ) {
        if (Date.now() > end) throw new Error(`El traductor quedó en "${stateRef.current}".`)
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    const w = window as unknown as {
      rumboTranslatorTalk?: (who: Speaker, text: string) => Promise<void>
      rumboDevMicOff?: () => void
    }
    w.rumboTranslatorTalk = async (who, text) => {
      if (!readDevMic()) {
        writeDevMic(true)
        installDevMic()
        await stop()
        await start()
      }
      await until((s) => s === "ready", 30_000)
      setHelpOpen(false)
      void pressRef.current(who)
      await until((s) => s === "listening", 15_000)
      const { myLang: mine, theirLang: theirs } = langsRef.current
      await speakIntoDevMic(text, who === "me" ? mine : theirs)
      await new Promise((r) => setTimeout(r, 800))
      void pressRef.current(who)
      await until((s) => s === "ready", 30_000)
    }
    w.rumboDevMicOff = () => {
      writeDevMic(false)
      window.location.reload()
    }
    return () => {
      delete w.rumboTranslatorTalk
      delete w.rumboDevMicOff
    }
  }, [start, stop])

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
      {/* Debajo de los botones flotantes de /talk (volver y mapa). */}
      <section className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-4 pt-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">Traductor</h1>
            <p className="text-muted-foreground text-[15px]">Para hablar con alguien del lugar</p>
          </div>
          <Button variant="secondary" size="icon" className="bg-card mt-1 rounded-full" aria-label="Cerrar traductor" onClick={onExit}>
            <XIcon className="size-5" />
          </Button>
        </div>

        <div className="bg-card flex items-center gap-1 rounded-2xl p-1.5">
          <LangSelect label="Yo hablo" value={myLang} onChange={setMyLang} disabled={busy} />
          <Button
            variant="ghost"
            size="icon"
            className="text-brand shrink-0 rounded-full"
            aria-label="Invertir idiomas"
            disabled={busy}
            onClick={() => {
              setMyLang(theirLang)
              chooseTheirLang(myLang)
            }}
          >
            <ArrowLeftRightIcon className="size-4" />
          </Button>
          <LangSelect label="La otra persona" value={theirLang} onChange={chooseTheirLang} disabled={busy} />
        </div>

        <ScrollFade className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 py-2">
            {helpOpen ? (
              <HowItWorks
                theirLang={LANGUAGES[theirLang]}
                onHide={() => {
                  setHelpOpen(false)
                  writeHelpHidden(true)
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(true)
                  writeHelpHidden(false)
                }}
                className="text-muted-foreground inline-flex items-center gap-1 self-center text-[13px]"
              >
                <CircleHelpIcon className="size-3.5" />
                ¿Cómo se usa?
              </button>
            )}
            {t.utterances.map((u) => (
              <div
                key={u.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2",
                  // Cada uno de su lado, como sus botones: yo a la izquierda, la otra persona a la derecha.
                  u.speaker === "me" ? "bg-brand self-start text-white" : "bg-card self-end",
                  !u.final && "opacity-70"
                )}
              >
                <p className="text-[17px] leading-snug">{u.translated || "…"}</p>
                {u.original && <p className="mt-1 text-xs opacity-75">{u.original}</p>}
                {u.speaker === "me" && u.final && u.translated && (
                  <button
                    type="button"
                    onClick={() => setShown(u)}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium"
                  >
                    <Maximize2Icon className="size-3" />
                    Mostrar
                  </button>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </ScrollFade>
        {children}
      </section>

      {shown && (
        <button
          type="button"
          onClick={() => setShown(null)}
          aria-label="Cerrar"
          className="animate-in fade-in bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-8 text-center duration-200"
        >
          <span className="text-muted-foreground text-[15px] font-medium">{LANGUAGES[theirLang]}</span>
          <p className="text-[clamp(28px,8vw,52px)] leading-tight font-semibold text-balance">
            {/* Francés: espacio antes de ? ! : ; » — que no corte la línea ahí. */}
            {shown.translated.replace(/ ([?!:;»])/g, "\u00a0$1").replace(/« /g, "«\u00a0")}
          </p>
          <span className="text-muted-foreground text-[13px]">Tocá para volver</span>
        </button>
      )}

      <footer className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground mb-3 text-center text-[13px]">
          {STATUS[t.state]}
          {t.spentUsd > 0 && <span className="tabular-nums"> · US${t.spentUsd.toFixed(3)}</span>}
        </p>
        <div className="flex items-center gap-3">
          <SpeakButton who="me" label="Hablo yo" lang={LANGUAGES[myLang]} t={t} onPress={press} />
          <SpeakButton who="them" label="Habla la otra persona" lang={LANGUAGES[theirLang]} t={t} onPress={press} />
        </div>
      </footer>
    </>
  )
}

function SpeakButton({
  who,
  label,
  lang,
  t,
  onPress,
}: {
  who: Speaker
  label: string
  lang: string
  t: ReturnType<typeof useTranslator>
  onPress: (who: Speaker) => void
}) {
  const active = t.speaker === who
  return (
    <Button
      size="lg"
      variant={active ? "default" : "secondary"}
      aria-pressed={active}
      disabled={t.state === "off"}
      className={cn("h-14 flex-1 rounded-full text-[15px]", !active && "bg-card")}
      onClick={() => onPress(who)}
    >
      {active && t.state === "connecting" ? <Spinner className="size-4 shrink-0" /> : <MicIcon className="size-4 shrink-0" />}
      {/* Quién habla, y abajo en qué idioma: "Habla la otra persona / Français". */}
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="truncate">{label}</span>
        <span className="text-[12px] font-normal opacity-70">{lang}</span>
      </span>
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
    <label className="hover:bg-muted/60 flex min-w-0 flex-1 flex-col rounded-xl px-2.5 py-1.5 transition-colors">
      <span className="text-muted-foreground text-[12px]">{label}</span>
      <select
        className="-ml-1 bg-transparent text-[17px] font-semibold outline-none disabled:opacity-60"
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

/** Antes de la primera frase: cómo se usa, en tres pasos. */
const HELP_KEY = "rumbo.translator.help-hidden"

function readHelpHidden(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === "1"
  } catch {
    return false
  }
}

function writeHelpHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HELP_KEY, "1")
    else localStorage.removeItem(HELP_KEY)
  } catch {
    // Sin storage (modo privado): se vuelve a mostrar la próxima vez.
  }
}

function HowItWorks({ theirLang, onHide }: { theirLang: string; onHide: () => void }) {
  const steps = [
    <>Cuando hable la otra persona ({theirLang}), tocá <b>Habla la otra persona</b> y otra vez al terminar.</>,
    <>Para responder, <b>Hablo yo</b>. Con <b>Mostrar</b> le enseñás tu frase en grande.</>,
    <>Si te recomienda un lugar, aparece abajo, queda guardado y te aviso cuando pases cerca.</>,
  ]
  return (
    <div className="bg-card relative rounded-2xl p-4 pr-10">
      <button
        type="button"
        onClick={onHide}
        aria-label="Ocultar cómo se usa"
        className="text-muted-foreground hover:bg-muted absolute top-2 right-2 rounded-full p-1.5"
      >
        <XIcon className="size-4" />
      </button>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug">
            <span className="bg-brand/10 text-brand flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const DEV_MIC_KEY = "rumbo.translator.dev-mic"

function readDevMic(): boolean {
  try {
    return localStorage.getItem(DEV_MIC_KEY) === "1"
  } catch {
    return false
  }
}

function writeDevMic(on: boolean) {
  try {
    if (on) localStorage.setItem(DEV_MIC_KEY, "1")
    else localStorage.removeItem(DEV_MIC_KEY)
  } catch {
    // Sin storage: el mic de mentira dura hasta recargar.
  }
}
