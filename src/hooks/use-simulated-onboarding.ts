"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { Capture, Insight } from "@/lib/onboarding/schema"
import { advanceQuestion, applyCapture, INITIAL_ONBOARDING, type OnboardingState } from "@/lib/onboarding/state"

import type { OnboardingCall, OnboardingEnd } from "./use-onboarding-call"
import type { CallState } from "./voice-session-types"

/**
 * Onboarding de mentira (`/onboarding?demo=1`): la misma pantalla con una charla guionada,
 * sin micrófono ni OpenAI. Sirve para ver la UI y las animaciones sin gastar.
 */
type Step =
  | { at: number; state: CallState }
  | { at: number; capture: Partial<Capture> }
  | { at: number; next: true }

const insight = (question: number, title: string, summary: string, detail: string, why: string, extra: Partial<Insight> = {}): Insight => ({
  question,
  title,
  summary,
  detail,
  why,
  kind: "preference",
  avoid: false,
  interest: null,
  diet: null,
  ...extra,
})

const SCRIPT: Step[] = [
  { at: 0, state: "talking" },
  { at: 3_500, state: "listening" },
  { at: 6_000, capture: { keywords: ["autos", "diseño"] } },
  { at: 7_500, state: "talking" },
  { at: 9_000, state: "listening" },
  {
    at: 10_500,
    capture: {
      keywords: ["curioso"],
      insights: [
        insight(1, "Fan de los autos clásicos", "Museos de autos y talleres de restauración", "Le apasionan los autos clásicos y de diseño italiano; busca museos de autos, salones y talleres donde se vea cómo se restauran.", "Dijo 'si hay un museo de autos, voy seguro'. Priorizar planes con autos cuando tenga tiempo libre.", { interest: "autos" }),
        insight(1, "Le gusta el diseño", "Tiendas y edificios con buen diseño", "Le atrae el diseño industrial y la arquitectura moderna; disfruta mirar objetos y fachadas con detalle.", "Contó que se pierde en tiendas de diseño. Sumar estudios y tiendas de diseño cerca de su ruta.", { interest: "diseño" }),
      ],
    },
  },
  { at: 11_500, next: true },
  { at: 11_600, state: "talking" },
  { at: 14_000, state: "listening" },
  {
    at: 16_500,
    capture: {
      keywords: ["madrugador", "sin apuro"],
      schedule: "madrugador",
      pace: "tranquilo",
      insights: [
        insight(2, "Madrugador y sin apuro", "Arranca temprano y prefiere pocas cosas bien hechas", "Se levanta temprano para aprovechar la ciudad vacía y prefiere 2 o 3 planes por día, sin correr de un lado a otro.", "Dijo 'prefiero ver poco pero bien'. Proponer planes a la mañana y dejar huecos libres."),
      ],
    },
  },
  { at: 17_500, next: true },
  { at: 17_600, state: "talking" },
  { at: 20_000, state: "listening" },
  {
    at: 22_000,
    capture: {
      keywords: ["vegetariano", "café"],
      insights: [
        insight(3, "Vegetariano", "No come carne ni pescado", "Es vegetariano: no come carne ni pescado. Le gusta probar la versión vegetariana de los platos locales.", "Lo dijo directo al hablar de comida. No recomendar parrillas ni marisquerías.", { kind: "constraint", diet: "vegetariano" }),
        insight(3, "Café de especialidad", "Busca buenos cafés para cortar el día", "Le encanta el café de especialidad y usa los cafés como pausa entre planes.", "Contó que siempre busca 'el mejor café del barrio'. Proponer cafés cerca a media tarde.", { interest: "café" }),
      ],
    },
  },
  { at: 23_000, next: true },
  { at: 23_100, state: "talking" },
  { at: 25_500, state: "listening" },
  {
    at: 27_500,
    capture: {
      keywords: ["en pareja", "camina mucho"],
      insights: [
        insight(4, "Viaja en pareja", "Con su pareja, caminando casi todo", "Viaja con su pareja; los dos caminan mucho y prefieren moverse a pie antes que en transporte.", "Dijo que caminan 'todo lo que se pueda'. Se pueden proponer caminatas de 20 a 30 minutos."),
      ],
    },
  },
  { at: 28_500, next: true },
  { at: 28_600, state: "talking" },
  { at: 31_000, state: "listening" },
  {
    at: 33_000,
    capture: {
      keywords: ["sin multitudes"],
      daily_budget: 80,
      insights: [
        insight(5, "Evita las multitudes", "Nada de filas largas ni lugares llenos", "Le incomodan las multitudes y las filas largas; prefiere ir temprano o elegir alternativas menos conocidas.", "Contó que se fue de un museo por la fila. Evitar horas pico y lugares muy turísticos.", { avoid: true }),
      ],
    },
  },
  { at: 34_000, next: true },
  { at: 34_100, state: "talking" },
]
const SCRIPT_END_MS = 37_000

const EMPTY_CAPTURE: Capture = { keywords: [], insights: [], pace: null, schedule: null, daily_budget: null, mobility: null }

export function useSimulatedOnboarding(onFinished: (end: OnboardingEnd) => void): OnboardingCall {
  const [state, setState] = useState<CallState>("off")
  const [onboarding, setOnboarding] = useState<OnboardingState>(INITIAL_ONBOARDING)
  const onboardingRef = useRef(INITIAL_ONBOARDING)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const inputVolumeRef = useRef(0)
  const outputVolumeRef = useRef(0)
  const stateRef = useRef<CallState>("off")
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  const update = (next: OnboardingState) => {
    onboardingRef.current = next
    setOnboarding(next)
  }
  const setCall = (s: CallState) => {
    stateRef.current = s
    setState(s)
  }

  const hangUp = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setCall("off")
  }, [])

  const connect = useCallback(async () => {
    setCall("connecting")
    await new Promise((r) => setTimeout(r, 600))
    return true
  }, [])

  const begin = useCallback(() => {
    let seq = 0
    timersRef.current = [
      ...SCRIPT.map((step) =>
        setTimeout(() => {
          if ("state" in step) setCall(step.state)
          else if ("capture" in step) update(applyCapture(onboardingRef.current, { ...EMPTY_CAPTURE, ...step.capture }, ++seq))
          else update(advanceQuestion(onboardingRef.current).state)
        }, step.at)
      ),
      setTimeout(() => {
        hangUp()
        onFinishedRef.current({ state: onboardingRef.current, transcript: [] })
      }, SCRIPT_END_MS),
    ]
  }, [hangUp])

  // Volumen falso para que el blob se mueva al "hablar" y al "escuchar".
  useEffect(() => {
    let frame = 0
    const tick = (t: number) => {
      const wave = Math.abs(Math.sin(t / 140) * Math.sin(t / 370))
      outputVolumeRef.current = stateRef.current === "talking" ? 0.25 + wave * 0.5 : 0
      inputVolumeRef.current = stateRef.current === "listening" ? wave * 0.35 : 0
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const snapshot = useCallback((): OnboardingEnd => ({ state: onboardingRef.current, transcript: [] }), [])

  return { state, onboarding, inputVolumeRef, outputVolumeRef, connect, begin, hangUp, snapshot }
}
