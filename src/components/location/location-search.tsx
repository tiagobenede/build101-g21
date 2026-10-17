"use client"

import { MapPinIcon, SearchIcon, XIcon } from "lucide-react"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { searchLocation } from "@/app/location/search"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { GeocodeResult } from "@/lib/location/geocode"

interface LocationSearchProps {
  onSelect: (result: GeocodeResult) => void
  onClose: () => void
}

/** Buscador para saltar con la ubicación simulada a cualquier lugar del mundo. */
export function LocationSearch({ onSelect, onClose }: LocationSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GeocodeResult[] | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await searchLocation(query)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setResults(res.data)
    })
  }

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2">
      <form onSubmit={submit} className="bg-card flex items-center gap-1 rounded-full p-1 pl-3.5 shadow-md">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ir a una ciudad, barrio o dirección"
          maxLength={100}
          className="h-9 border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0"
        />
        {pending ? (
          <Spinner className="text-muted-foreground mx-2.5" />
        ) : (
          <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Cerrar búsqueda" onClick={onClose}>
            <XIcon />
          </Button>
        )}
      </form>

      {results && (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-md ring-0 [&>[data-slot=item]:not(:last-child)]:border-b-border">
          {results.length === 0 ? (
            <p className="text-muted-foreground px-4 py-3 text-[15px]">No encontré ese lugar.</p>
          ) : (
            results.map((r) => (
              <Item key={`${r.lat},${r.lng}`} asChild className="rounded-none px-4 py-3 hover:bg-muted/60">
                <button type="button" onClick={() => onSelect(r)} className="text-left">
                  <ItemMedia>
                    <MapPinIcon className="text-brand size-5" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="text-[15px]">{r.name}</ItemTitle>
                    {r.detail && <ItemDescription className="truncate text-[13px]">{r.detail}</ItemDescription>}
                  </ItemContent>
                </button>
              </Item>
            ))
          )}
        </Card>
      )}
    </div>
  )
}
