/**
 * Arma la frase de un turno (lo que alguien dijo entre apretar y soltar su botón) con
 * los deltas de la sesión: el original (`session.input_transcript.delta`) y la traducción
 * (`session.output_transcript.delta`) llegan por separado, a destiempo y en bloques con
 * huecos de varios segundos (el último, al soltar). Por eso no se corta por pausas.
 */
import type { Speaker } from "./config"

export type Utterance = {
  id: string
  speaker: Speaker
  original: string
  translated: string
  /** Cerrada: ya no le llegan más palabras (y se puede guardar). */
  final: boolean
}

export class UtteranceBuilder {
  private readonly current: Utterance
  private done = false

  constructor(speaker: Speaker, id = `${speaker}-${Date.now()}`) {
    this.current = { id, speaker, original: "", translated: "", final: false }
  }

  /** Suma un delta y devuelve cómo va la frase. */
  add(kind: "input" | "output", delta: string): Utterance {
    if (kind === "input") this.current.original += delta
    else this.current.translated += delta
    return { ...this.current }
  }

  /** Cierra el turno. Devuelve la frase final una sola vez, o null si no se dijo nada. */
  finish(): Utterance | null {
    if (this.done) return null
    this.done = true
    const final = { ...this.current, original: this.current.original.trim(), translated: this.current.translated.trim(), final: true }
    return final.original || final.translated ? final : null
  }
}
