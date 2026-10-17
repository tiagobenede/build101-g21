import { Suspense } from "react"

import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { getTravelerContext } from "@/lib/data/session"

import { TalkClient } from "./talk-client"


const SUGGESTIONS_BY_INTEREST: Record<string, string> = {
  autos: "¿Hay algo de autos cerca?",
  comida: "Tengo hambre, ¿dónde como rico?",
  arte: "Quiero ver arte, tengo una hora",
  café: "¿Dónde me tomo un buen café?",
  libros: "¿Alguna librería linda cerca?",
  parques: "Quiero caminar al aire libre",
}

async function TalkContent() {
  const ctx = await getTravelerContext()
  const suggestions = [
    "Tengo 30 minutos, ¿qué hago?",
    ...ctx.interests.map((i) => SUGGESTIONS_BY_INTEREST[i]).filter(Boolean),
    "Tengo hora y media libre",
  ].slice(0, 4)

  return (
    <TalkClient
      firstName={ctx.firstName}
      locationLabel={ctx.locationLabel}
      suggestions={suggestions}
    />
  )
}

export default function TalkPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TalkContent />
    </Suspense>
  )
}
