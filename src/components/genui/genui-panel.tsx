"use client"

import "@/lib/genui/no-devtools"

import { Renderer } from "@openuidev/react-lang"
import { useMemo } from "react"

import type { GenUiScreen } from "@/hooks/use-genui"
import type { GenUiPlace } from "@/lib/genui/types"

import { GenUiEnvProvider, genUiLibrary, type GenUiEnv } from "./genui-library"

interface GenUiPanelProps {
  screen: GenUiScreen
  ask: GenUiEnv["ask"]
  addToPlan: (place: GenUiPlace) => void
}

/** Pantalla generada por el modelo (OpenUI), dibujada con nuestros componentes mientras llega. */
export function GenUiPanel({ screen, ask, addToPlan }: GenUiPanelProps) {
  const env = useMemo<GenUiEnv | null>(
    () => (screen.data ? { data: screen.data, ask, addToPlan } : null),
    [screen.data, ask, addToPlan]
  )

  if (!env || !screen.response) {
    return (
      <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Armando la pantalla">
        <div className="bg-card h-6 w-3/4 animate-pulse rounded-full" />
        <div className="bg-card h-40 animate-pulse rounded-[22px]" />
      </div>
    )
  }

  return (
    <GenUiEnvProvider value={env}>
      <Renderer response={screen.response} library={genUiLibrary} isStreaming={screen.streaming} />
    </GenUiEnvProvider>
  )
}
