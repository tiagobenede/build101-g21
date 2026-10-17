"use client"

import { TALK_STATUS_IDLE, VoiceStage } from "@/components/rumbo/voice-stage"

const NO_VOLUME = { current: 0 }

/** Mientras carga /talk: el blob ya está en su lugar (ahí aterriza el de la barra). */
export function TalkSkeleton() {
  return (
    <main className="relative h-dvh overflow-hidden">
      <VoiceStage
        state="off"
        inputVolumeRef={NO_VOLUME}
        outputVolumeRef={NO_VOLUME}
        glow={false}
        status={TALK_STATUS_IDLE}
        className="absolute inset-x-0 top-[30%] z-0"
      />
    </main>
  )
}
