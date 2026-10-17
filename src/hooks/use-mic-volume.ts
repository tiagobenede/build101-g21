"use client"

import { useCallback, useEffect, useRef } from "react"

const SMOOTHING = 0.8
const GAIN = 4

/** Abre el micrófono y expone el volumen (0..1) en un ref, actualizado por frame. */
export function useMicVolume() {
  const volumeRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    volumeRef.current = 0
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    if (cleanupRef.current) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = SMOOTHING
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)

      let frame = 0
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        volumeRef.current = Math.min(1, Math.sqrt(sum / data.length) * GAIN)
        frame = requestAnimationFrame(tick)
      }
      tick()

      cleanupRef.current = () => {
        cancelAnimationFrame(frame)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
      }
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => stop, [stop])

  return { volumeRef, start, stop }
}
