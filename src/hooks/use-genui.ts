"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { LatLng } from "@/lib/geo"
import { GENUI_DATA_PREFIX, type GenUiData, type GenUiRequest } from "@/lib/genui/types"

export type GenUiScreen = {
  id: string
  request: string
  data: GenUiData | null
  /** OpenUI Lang que va llegando. */
  response: string
  streaming: boolean
}

/** Pide pantallas a /api/genui y las deja listas para <Renderer>, a medida que llegan. */
export function useGenUi(getLocation: () => LatLng | null) {
  const [screen, setScreen] = useState<GenUiScreen | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const locationRef = useRef(getLocation)

  useEffect(() => {
    locationRef.current = getLocation
  }, [getLocation])

  useEffect(() => () => abortRef.current?.abort(), [])

  const show = useCallback(async ({ request, placeIds }: GenUiRequest) => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    const id = crypto.randomUUID()
    setScreen({ id, request, data: null, response: "", streaming: true })

    try {
      const res = await fetch("/api/genui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, placeIds, location: locationRef.current() }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) throw new Error(`genui ${res.status}`)

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let raw = ""
      let data: GenUiData | null = null
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        raw += value
        if (!data) {
          const newline = raw.indexOf("\n")
          if (newline < 0) continue
          data = JSON.parse(raw.slice(GENUI_DATA_PREFIX.length, newline)) as GenUiData
          raw = raw.slice(newline + 1)
        }
        const response = raw
        setScreen((s) => (s?.id === id ? { ...s, data, response } : s))
      }
      setScreen((s) => (s?.id === id ? { ...s, streaming: false } : s))
    } catch (err) {
      if (abort.signal.aborted) return
      console.error("[genui]", err instanceof Error ? err.message : err)
      setScreen((s) => (s?.id === id ? null : s))
    }
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setScreen(null)
  }, [])

  return { screen, show, clear }
}
