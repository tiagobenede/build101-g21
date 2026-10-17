"use client"

import { useEffect } from "react"

/**
 * Pantallas que no se tapan con un aviso por cercanía (hoy, la cámara). Mientras alguna
 * está abierta, el aviso espera (sin sonar) y aparece al cerrarla.
 */
let holds = 0
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((fn) => fn())

export function subscribeHolds(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const notificationsHeld = () => holds > 0

/** Retiene los avisos mientras `active` sea true. */
export function useHoldNotifications(active: boolean) {
  useEffect(() => {
    if (!active) return
    holds++
    emit()
    return () => {
      holds--
      emit()
    }
  }, [active])
}
