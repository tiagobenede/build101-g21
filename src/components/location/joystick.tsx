"use client"

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

import { useLocation } from "./location-provider"

const DEFAULT_SIZE_PX = 112

interface JoystickProps {
  className?: string
  /** Diámetro en px. */
  size?: number
}

/** Joystick (nipplejs) que mueve la ubicación simulada. */
export function Joystick({ className, size = DEFAULT_SIZE_PX }: JoystickProps) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const { setVector } = useLocation()

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return
    let destroyed = false
    let destroy: (() => void) | null = null

    // nipplejs toca el DOM al importarse: se carga solo en el cliente.
    void import("nipplejs").then(({ create }) => {
      if (destroyed) return
      const manager = create({
        zone,
        mode: "static",
        position: { left: "50%", top: "50%" },
        size: size * 0.85,
        color: { front: "#1D1D1F", back: "rgba(29, 29, 31, 0.08)" },
        restOpacity: 1,
      })
      manager.on("move", ({ data }) => {
        const force = Math.min(1, data.force)
        setVector({ x: data.vector.x * force, y: data.vector.y * force })
      })
      manager.on("end", () => setVector({ x: 0, y: 0 }))
      destroy = () => manager.destroy()
    })

    return () => {
      destroyed = true
      setVector({ x: 0, y: 0 })
      destroy?.()
    }
  }, [setVector, size])

  return (
    <div
      ref={zoneRef}
      aria-label="Joystick para moverte"
      className={cn("bg-card/90 relative rounded-full shadow-lg backdrop-blur-xl touch-none", className)}
      style={{ width: size, height: size }}
    />
  )
}
