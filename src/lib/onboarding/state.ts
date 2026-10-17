/**
 * Estado del onboarding mientras dura la llamada: pregunta actual, palabras clave (las
 * burbujas) e insights. Puro e inmutable: cada tool del agente devuelve un estado nuevo.
 */
import { LAST_QUESTION, ONBOARDING_QUESTIONS } from "./questions"
import type { Capture, Insight, OnboardingResult } from "./schema"

export type Keyword = { id: string; text: string }

export type OnboardingState = {
  question: number
  done: boolean
  keywords: Keyword[]
  insights: Insight[]
  pace: OnboardingResult["pace"]
  schedule: OnboardingResult["schedule"]
  dailyBudget: OnboardingResult["dailyBudget"]
  mobility: OnboardingResult["mobility"]
}

export const INITIAL_ONBOARDING: OnboardingState = {
  question: 1,
  done: false,
  keywords: [],
  insights: [],
  pace: null,
  schedule: null,
  dailyBudget: null,
  mobility: null,
}

/** Lo último que dice el agente antes del resumen. */
export const CLOSING_LINE = "Listo, te muestro lo que entendí."

const norm = (s: string) => s.trim().toLocaleLowerCase("es")

/** Suma lo que anotó el agente. `seq` hace únicos los ids de las burbujas. */
export function applyCapture(state: OnboardingState, capture: Capture, seq: number): OnboardingState {
  const seen = new Set(state.keywords.map((k) => norm(k.text)))
  const keywords = capture.keywords
    .map((text) => text.trim())
    .filter((text) => {
      const key = norm(text)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((text, i) => ({ id: `${seq}-${i}`, text }))

  const replaced = new Set(capture.insights.map((i) => norm(i.title)))
  return {
    ...state,
    keywords: [...state.keywords, ...keywords],
    insights: [...state.insights.filter((i) => !replaced.has(norm(i.title))), ...capture.insights],
    pace: capture.pace ?? state.pace,
    schedule: capture.schedule ?? state.schedule,
    dailyBudget: capture.daily_budget ?? state.dailyBudget,
    mobility: capture.mobility ?? state.mobility,
  }
}

/** Pasa a la siguiente pregunta; `output` es lo que lee el agente. */
export function advanceQuestion(state: OnboardingState): { state: OnboardingState; output: string } {
  if (state.question >= LAST_QUESTION) {
    // El agente tiende a seguir preguntando: la respuesta le dice exactamente cómo cerrar.
    return { state: { ...state, done: true }, output: JSON.stringify({ done: true, say: CLOSING_LINE, then: "No preguntes nada más." }) }
  }
  const next = ONBOARDING_QUESTIONS[state.question]
  return {
    state: { ...state, question: next.id },
    output: JSON.stringify({ question: next.id, title: next.title, goal: next.goal }),
  }
}

/** Lo que se guarda: todo menos los insights que el viajero desmarcó (por titular). */
export function toResult(state: OnboardingState, rejectedTitles: ReadonlySet<string>): OnboardingResult {
  return {
    insights: state.insights.filter((i) => !rejectedTitles.has(i.title)),
    pace: state.pace,
    schedule: state.schedule,
    dailyBudget: state.dailyBudget,
    mobility: state.mobility,
  }
}
