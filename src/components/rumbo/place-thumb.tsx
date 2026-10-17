"use client"

import { useState } from "react"

import { CategoryIcon } from "@/components/rumbo/category-icon"
import { cn } from "@/lib/utils"

/** Foto principal de un lugar de `places` (Google), servida por nuestra API. */
export const placePhotoUrl = (placeId: string) => `/api/places/photo/${encodeURIComponent(placeId)}`

interface PlaceThumbProps {
  category: string
  /** null: no hay foto, va el ícono del tipo solo. */
  photoUrl: string | null
  /** Tamaño y radio de la miniatura ("size-11 rounded-[12px]"). */
  className?: string
}

/**
 * Miniatura de un lugar en una lista: la foto del local con el ícono del tipo chico abajo a
 * la derecha. Sin foto (o si no carga), el ícono del tipo solo, del mismo tamaño.
 */
export function PlaceThumb({ category, photoUrl, className = "size-11 rounded-[12px]" }: PlaceThumbProps) {
  const [photoOk, setPhotoOk] = useState(true)
  if (!photoUrl || !photoOk) return <CategoryIcon category={category} className={cn("shrink-0", className)} />
  return (
    <span className={cn("relative shrink-0", className)}>
      {/* Foto de Google, de un dominio que cambia: <img> y no next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        onError={() => setPhotoOk(false)}
        className="bg-muted size-full rounded-[inherit] object-cover"
      />
      <CategoryIcon
        category={category}
        className="ring-card absolute -right-1 -bottom-1 size-[18px] rounded-[6px] ring-2 [&_svg]:size-[11px]"
      />
    </span>
  )
}
