"use client"

import { useCallback, useSyncExternalStore } from "react"

import { CLOCK_COOKIE, parseClockOffset, shiftedNow } from "@/lib/time/clock"

const CHANGE_EVENT = "rumbo:clock"

function readOffset(): number {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CLOCK_COOKIE}=([^;]*)`))
  return parseClockOffset(match?.[1])
}

/** "Ahora" en el cliente, con la hora simulada si hay (fuera de React: handlers, timers). */
export function clientNow(): Date {
  return typeof document === "undefined" ? new Date() : shiftedNow(readOffset())
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

/** Diferencia de la hora simulada con la real (0 = hora real) y cómo cambiarla. */
export function useClock() {
  const offsetMs = useSyncExternalStore(subscribe, readOffset, () => 0)
  const setOffsetMs = useCallback((next: number) => {
    // Un año: la cookie dura lo que dure la demo; con 0 se borra y vuelve la hora real.
    document.cookie =
      next === 0
        ? `${CLOCK_COOKIE}=; path=/; max-age=0; samesite=lax`
        : `${CLOCK_COOKIE}=${Math.round(next)}; path=/; max-age=31536000; samesite=lax`
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return { offsetMs, setOffsetMs }
}
