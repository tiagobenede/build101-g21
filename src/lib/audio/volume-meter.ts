const GAIN = 4

export interface VolumeMeter {
  /** Volumen RMS actual (0..1). */
  read: () => number
  stop: () => void
}

/** Mide el volumen de un MediaStream (mic o audio remoto) con Web Audio. */
export function createVolumeMeter(stream: MediaStream): VolumeMeter {
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.8
  ctx.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.fftSize)

  return {
    read() {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      return Math.min(1, Math.sqrt(sum / data.length) * GAIN)
    },
    stop() {
      void ctx.close()
    },
  }
}
