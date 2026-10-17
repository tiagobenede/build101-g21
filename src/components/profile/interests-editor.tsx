"use client"

import { CheckIcon } from "lucide-react"
import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { toggleInterest } from "@/app/profile/actions"
import { GroupedList, Section } from "@/components/rumbo/section"
import { Button } from "@/components/ui/button"
import type { InterestTag } from "@/lib/agent/rank"
import { cn } from "@/lib/utils"

interface InterestsEditorProps {
  interests: string[]
  /** Todos los gustos que el agente sabe usar (`INTEREST_TAGS`). */
  options: readonly InterestTag[]
}

/** "Tus gustos": se ven como chips y con "Editar" se prenden o apagan (se guarda al tocar). */
export function InterestsEditor({ interests, options }: InterestsEditorProps) {
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useOptimistic(interests, (current, { tag, on }: { tag: string; on: boolean }) =>
    on ? [...current, tag] : current.filter((t) => t !== tag)
  )

  const toggle = (tag: InterestTag) => {
    const on = !selected.includes(tag)
    startTransition(async () => {
      setSelected({ tag, on })
      const r = await toggleInterest(tag, on)
      if (!r.ok) toast.error(r.error)
    })
  }

  const visible = editing ? options : selected
  return (
    <Section
      title="Tus gustos"
      action={
        <Button variant="link" size="sm" className="h-auto p-0 text-[15px]" onClick={() => setEditing((e) => !e)}>
          {editing ? "Listo" : "Editar"}
        </Button>
      }
    >
      {visible.length === 0 ? (
        <GroupedList className="px-4 py-3">
          <p className="text-muted-foreground text-[15px]">Todavía no elegiste gustos. Tocá “Editar” para sumar.</p>
        </GroupedList>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visible.map((tag) => {
            const on = selected.includes(tag)
            return editing ? (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tag as InterestTag)}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-full px-3 text-[14px] capitalize transition-colors",
                  on ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
                )}
              >
                {on && <CheckIcon className="size-3.5" />}
                {tag}
              </button>
            ) : (
              <span key={tag} className="bg-card flex h-7 items-center rounded-full px-3 text-[13px] capitalize">
                {tag}
              </span>
            )
          })}
        </div>
      )}
    </Section>
  )
}
