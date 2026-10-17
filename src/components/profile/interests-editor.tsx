"use client"

import { CheckIcon, PlusIcon } from "lucide-react"
import { useOptimistic, useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { toggleInterest } from "@/app/profile/actions"
import { GroupedList, Section } from "@/components/rumbo/section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface InterestsEditorProps {
  interests: string[]
  /** Gustos sugeridos (`INTEREST_TAGS`); además se pueden escribir otros. */
  options: readonly string[]
}

/** "Tus gustos": se ven como chips y con "Editar" se prenden, apagan o suman nuevos (se guarda al tocar). */
export function InterestsEditor({ interests, options }: InterestsEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  /** Los que se escribieron a mano mientras edita: siguen a la vista aunque se apaguen. */
  const [added, setAdded] = useState<string[]>([])
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useOptimistic(interests, (current, { tag, on }: { tag: string; on: boolean }) =>
    on ? [...current, tag] : current.filter((t) => t !== tag)
  )

  const save = (tag: string, on: boolean) => {
    startTransition(async () => {
      setSelected({ tag, on })
      const r = await toggleInterest(tag, on)
      if (!r.ok) toast.error(r.error)
    })
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    const tag = draft.trim().toLowerCase()
    if (tag.length < 2) return
    setDraft("")
    if (!added.includes(tag)) setAdded((a) => [...a, tag])
    if (!selected.includes(tag)) save(tag, true)
  }

  const visible = editing ? [...new Set([...options, ...interests, ...added])] : selected
  return (
    <Section
      title="Tus gustos"
      action={
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-[15px]"
          onClick={() => {
            setEditing((e) => !e)
            setAdded([])
          }}
        >
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
                onClick={() => save(tag, !on)}
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
      {editing && (
        <form onSubmit={add} className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Otro gusto (ej: jazz, vinos)"
            maxLength={30}
            aria-label="Nuevo gusto"
            className="bg-card h-9 rounded-full px-4 text-[15px]"
          />
          <Button type="submit" size="sm" className="h-9 rounded-full" disabled={draft.trim().length < 2}>
            <PlusIcon className="size-4" />
            Agregar
          </Button>
        </form>
      )}
    </Section>
  )
}
