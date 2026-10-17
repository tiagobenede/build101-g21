/** Lo que el agente aprendió del viajero hablando (`profile_facts`). */
export type ProfileFact = {
  kind: "constraint" | "preference"
  statement: string
  /** 1 = le gusta / lo necesita, -1 = lo evita. */
  polarity: 1 | -1
}

/** Va en las instrucciones en cada turno: se recorta para cuidar los tokens. */
export const MAX_FACTS_IN_SUMMARY = 8
const MAX_STATEMENT_CHARS = 120

const clean = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ").replace(/[.;]+$/, "")
  return t.length > MAX_STATEMENT_CHARS ? `${t.slice(0, MAX_STATEMENT_CHARS - 1)}…` : t
}

/**
 * Arma `profiles.compiled_summary` con una plantilla, sin modelo. Recibe los hechos
 * vigentes del más nuevo al más viejo; devuelve null si no hay nada que decir.
 */
export function compileProfileSummary(facts: readonly ProfileFact[]): string | null {
  const recent = facts.slice(0, MAX_FACTS_IN_SUMMARY)
  const pick = (kind: ProfileFact["kind"], polarity: 1 | -1) =>
    recent.filter((f) => f.kind === kind && f.polarity === polarity).map((f) => clean(f.statement))

  const parts = [
    ["No negociable", [...pick("constraint", 1), ...pick("constraint", -1)]],
    ["Le gusta", pick("preference", 1)],
    ["Evita", pick("preference", -1)],
  ] as const

  const lines = parts.filter(([, items]) => items.length > 0).map(([label, items]) => `${label}: ${items.join("; ")}.`)
  return lines.length > 0 ? lines.join(" ") : null
}
