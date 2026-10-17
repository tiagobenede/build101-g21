"use client"

let context: AudioContext | null = null

/**
 * "Ding" corto de dos notas para los avisos, generado con Web Audio (sin archivo).
 * Si el navegador todavía no dejó reproducir audio (nadie tocó la página), no suena.
 */
export function playChime(): void {
  try {
    context ??= new AudioContext()
    if (context.state === "suspended") void context.resume()
    const now = context.currentTime
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      const start = now + i * 0.12
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45)
      osc.connect(gain).connect(context.destination)
      osc.start(start)
      osc.stop(start + 0.5)
    }
  } catch {
    // Sin audio no pasa nada: el aviso igual se ve.
  }
}
