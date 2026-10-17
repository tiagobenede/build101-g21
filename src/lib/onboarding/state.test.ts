import { describe, expect, it } from "vitest"

import { LAST_QUESTION, ONBOARDING_QUESTIONS } from "./questions"
import type { Insight } from "./schema"
import { advanceQuestion, applyCapture, CLOSING_LINE, INITIAL_ONBOARDING, toResult } from "./state"

const insight = (title: string, question = 1): Insight => ({
  question,
  title,
  summary: `${title}, en una línea`,
  detail: `${title}: descripción larga para el guía`,
  why: "Lo dijo así",
  kind: "preference",
  avoid: false,
  interest: "autos",
  diet: null,
})

const capture = (over: Partial<Parameters<typeof applyCapture>[1]> = {}) => ({
  keywords: [],
  insights: [],
  pace: null,
  schedule: null,
  daily_budget: null,
  mobility: null,
  ...over,
})

describe("applyCapture", () => {
  it("suma palabras clave nuevas sin repetir (sin importar mayúsculas)", () => {
    const a = applyCapture(INITIAL_ONBOARDING, capture({ keywords: ["autos", "curioso"] }), 1)
    const b = applyCapture(a, capture({ keywords: ["Autos", "museos"] }), 2)
    expect(b.keywords.map((k) => k.text)).toEqual(["autos", "curioso", "museos"])
    expect(b.keywords[2].id).not.toBe(b.keywords[0].id)
  })

  it("un insight con el mismo titular reemplaza al anterior", () => {
    const a = applyCapture(INITIAL_ONBOARDING, capture({ insights: [insight("Fan de los autos")] }), 1)
    const b = applyCapture(a, capture({ insights: [{ ...insight("fan de los autos"), detail: "Más preciso" }] }), 2)
    expect(b.insights).toHaveLength(1)
    expect(b.insights[0].detail).toBe("Más preciso")
  })

  it("los campos de perfil null no pisan lo que ya se sabía", () => {
    const a = applyCapture(INITIAL_ONBOARDING, capture({ pace: "tranquilo", daily_budget: 80 }), 1)
    const b = applyCapture(a, capture({ schedule: "madrugador" }), 2)
    expect(b).toMatchObject({ pace: "tranquilo", dailyBudget: 80, schedule: "madrugador" })
  })

  it("no modifica el estado anterior", () => {
    applyCapture(INITIAL_ONBOARDING, capture({ keywords: ["autos"] }), 1)
    expect(INITIAL_ONBOARDING.keywords).toEqual([])
  })
})

describe("advanceQuestion", () => {
  it("pasa a la siguiente y le devuelve al agente la pregunta nueva", () => {
    const { state, output } = advanceQuestion(INITIAL_ONBOARDING)
    expect(state.question).toBe(2)
    expect(JSON.parse(output)).toEqual({ question: 2, title: ONBOARDING_QUESTIONS[1].title, goal: ONBOARDING_QUESTIONS[1].goal })
  })

  it("después de la última, termina", () => {
    const last = { ...INITIAL_ONBOARDING, question: LAST_QUESTION }
    const { state, output } = advanceQuestion(last)
    expect(state.done).toBe(true)
    expect(state.question).toBe(LAST_QUESTION)
    expect(JSON.parse(output)).toMatchObject({ done: true, say: CLOSING_LINE })
  })
})

describe("toResult", () => {
  it("solo guarda los insights que el viajero dejó marcados", () => {
    const s = applyCapture(INITIAL_ONBOARDING, capture({ insights: [insight("A"), insight("B")], pace: "intenso" }), 1)
    expect(toResult(s, new Set(["B"])).insights.map((i) => i.title)).toEqual(["A"])
    expect(toResult(s, new Set()).pace).toBe("intenso")
  })
})
