/**
 * Las 5 preguntas del onboarding por voz. `title` es el titular arriba del blob; `goal`
 * le dice al agente qué tiene que averiguar antes de pasar a la siguiente.
 */
export type OnboardingQuestion = { id: number; title: string; goal: string }

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: 1,
    title: "¿Qué te hace feliz cuando viajás?",
    goal: "Sus gustos de verdad: qué busca en una ciudad (arte, autos, comida, historia, compras, naturaleza, diseño…) y por qué le atrae.",
  },
  {
    id: 2,
    title: "¿Cómo es tu día ideal de viaje?",
    goal: "Su ritmo y horarios: tranquilo o intenso, madrugador o noctámbulo, planificado o improvisado, cuánto tiempo le gusta quedarse en un lugar.",
  },
  {
    id: 3,
    title: "¿Qué comés y qué no?",
    goal: "Dieta, alergias o cosas que no come, y su relación con la comida en un viaje (probar lo local, cafés, mercados, comer rápido).",
  },
  {
    id: 4,
    title: "¿Con quién viajás y cómo te movés?",
    goal: "Si viaja solo, en pareja, con amigos o con chicos; cuánto camina y si tiene alguna limitación de movilidad.",
  },
  {
    id: 5,
    title: "¿Qué querés evitar y cuánto querés gastar?",
    goal: "Lo que le aburre o evita (multitudes, museos largos, trampas para turistas) y un presupuesto aproximado por día.",
  },
]

export const LAST_QUESTION = ONBOARDING_QUESTIONS.length
