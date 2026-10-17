import type { Insight } from "./schema"

/** Va en las instrucciones del guía en cada turno: largo, pero con tope. */
export const MAX_STYLE_CHARS = 1_500

/**
 * Texto completo de lo que contó en el onboarding (detalle + por qué), para que el guía
 * lo tenga siempre en contexto. La pantalla solo muestra los titulares.
 */
export function onboardingStyleText(insights: readonly Insight[]): string | null {
  if (insights.length === 0) return null
  const lines = insights.map((i) => `${i.title}: ${i.detail.replace(/\.$/, "")} (${i.why.replace(/\.$/, "")}).`)
  const text = `Lo que contó en su primera charla — ${lines.join(" ")}`
  return text.length > MAX_STYLE_CHARS ? `${text.slice(0, MAX_STYLE_CHARS - 1)}…` : text
}
