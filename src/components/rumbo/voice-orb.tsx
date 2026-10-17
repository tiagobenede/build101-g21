"use client"

import { useEffect, useRef, type RefObject } from "react"

import type { CallState } from "@/hooks/voice-session-types"
import { cn } from "@/lib/utils"

const POINTS = 96
const BLUE = "#0071E3"
const HALO = "rgba(0, 113, 227, 0.12)"

/** Cuánto se deforma el borde en cada estado (además del volumen). */
const BASE_WOBBLE: Record<CallState, number> = { off: 0.012, connecting: 0.04, listening: 0.03, thinking: 0.04, talking: 0.03 }
const VOLUME_GAIN = 0.16

interface VoiceOrbProps {
  state: CallState
  inputVolumeRef: RefObject<number>
  outputVolumeRef: RefObject<number>
  className?: string
}

/**
 * Blob de voz: un círculo azul que se deforma suave con el volumen
 * (micrófono al escuchar, voz del agente al hablar). Canvas 2D, sin WebGL.
 */
export function VoiceOrb({ state, inputVolumeRef, outputVolumeRef, className }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    let frame = 0
    let level = 0

    const draw = (t: number) => {
      const dpr = window.devicePixelRatio || 1
      const size = canvas.clientWidth
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr
        canvas.height = size * dpr
      }

      const s = stateRef.current
      const volume = s === "listening" ? inputVolumeRef.current : s === "talking" ? outputVolumeRef.current : 0
      level += ((volume ?? 0) - level) * 0.15

      const center = (size * dpr) / 2
      const radius = center * 0.62
      const wobble = BASE_WOBBLE[s] + level * VOLUME_GAIN
      const breathe = s === "off" || s === "listening" ? Math.sin(t / 900) * 0.015 : 0
      const time = t / (s === "thinking" || s === "connecting" ? 350 : 600)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawBlob(ctx, center, radius * (1.12 + level * 0.25 + breathe), wobble * 1.6, time * 0.8, HALO)
      drawBlob(ctx, center, radius * (1 + breathe), wobble, time, BLUE)

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [inputVolumeRef, outputVolumeRef])

  return <canvas ref={canvasRef} className={cn("aspect-square", className)} aria-hidden />
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  center: number,
  radius: number,
  wobble: number,
  time: number,
  fill: string
) {
  ctx.beginPath()
  for (let i = 0; i <= POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2
    // Suma de senos con fases distintas: deformación orgánica sin ruido externo.
    const n = Math.sin(a * 3 + time) * 0.5 + Math.sin(a * 5 - time * 1.3) * 0.3 + Math.sin(a * 2 + time * 0.7) * 0.2
    const r = radius * (1 + n * wobble)
    const x = center + Math.cos(a) * r
    const y = center + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}
