import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { activeTripId } from "@/lib/data/trips"

import {
  isRecent,
  messagesToTurns,
  SUMMARY_SYSTEM_PROMPT,
  transcriptText,
  type RecentTranslation,
  type TranslationMessage,
} from "./recent"

/** Igual que los tips: rápido y barato (~US$0,0003 por charla). */
const SUMMARY_MODEL = process.env.TIPS_MODEL ?? "gpt-6-luna"
const SUMMARY_TIMEOUT_MS = 10_000
/** Una charla larga con el traductor no pasa de esto; lo demás queda afuera del resumen. */
const MAX_MESSAGES = 200

/** El viaje en curso (para colgarle la conversación y saber la ciudad), o null. */
export async function activeTrip(supabase: SupabaseClient): Promise<{ id: string; destination: string } | null> {
  const id = await activeTripId(supabase)
  if (!id) return null
  const { data } = await supabase.from("trips").select("id, destination").eq("id", id).maybeSingle()
  return data ? { id: data.id as string, destination: data.destination as string } : null
}

async function translationMessages(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, lang, content, translated_text, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES)
  if (error) throw new Error(error.message)
  return data as (TranslationMessage & { created_at: string })[]
}

/**
 * La última charla con el traductor, si terminó hace menos de
 * `RECENT_TRANSLATION_MINUTES` (o sigue abierta). null si no hay o ya pasó.
 */
export async function recentTranslation(supabase: SupabaseClient, now = new Date()): Promise<RecentTranslation | null> {
  // Una que empezó hace mucho puede haber terminado hace poco: alcanza con mirar la última.
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, lang_pair, summary, started_at, ended_at")
    .eq("kind", "translation")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[translate] recent conversation", error.message)
    return null
  }
  if (!conversation) return null
  if (conversation.ended_at && !isRecent(new Date(conversation.ended_at as string), now)) return null

  const messages = await translationMessages(supabase, conversation.id as string).catch((err: unknown) => {
    console.error("[translate] recent messages", err instanceof Error ? err.message : err)
    return null
  })
  if (!messages || messages.length === 0) return null
  // Si no llegó a cerrarse (se cerró la pestaña sin aviso), cuenta la última frase.
  const finishedAt = new Date((conversation.ended_at as string | null) ?? messages.at(-1)!.created_at)
  if (!isRecent(finishedAt, now)) return null

  return {
    id: conversation.id as string,
    langPair: conversation.lang_pair as string | null,
    summary: conversation.summary as string | null,
    turns: messagesToTurns(messages),
    finishedAt,
  }
}

/** Resume la charla y la guarda en `conversations.summary`. No hace nada si no hubo frases. */
export async function summarizeTranslation(supabase: SupabaseClient, conversationId: string): Promise<void> {
  const messages = await translationMessages(supabase, conversationId)
  if (messages.length === 0) return

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: transcriptText(messagesToTurns(messages)) },
      ],
    }),
    signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const summary = body.choices?.[0]?.message?.content?.trim()
  if (!summary) throw new Error("OpenAI no devolvió el resumen.")

  const { error } = await supabase.from("conversations").update({ summary }).eq("id", conversationId)
  if (error) throw new Error(error.message)
}
