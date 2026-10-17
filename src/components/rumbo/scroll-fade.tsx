"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

const FADE_PX = 32

interface ScrollFadeProps {
  children: ReactNode
  className?: string
}

/**
 * Contenedor con scroll vertical que difumina el borde de arriba/abajo solo
 * cuando hay más contenido en esa dirección.
 */
export function ScrollFade({ children, className }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const top = el.scrollTop > 1
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    Array.from(el.children).forEach((child) => observer.observe(child))
    const mutations = new MutationObserver(measure)
    mutations.observe(el, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [measure])

  const mask = `linear-gradient(to bottom, transparent 0, #000 ${edges.top ? FADE_PX : 0}px, #000 calc(100% - ${edges.bottom ? FADE_PX : 0}px), transparent 100%)`
  const style: CSSProperties = { maskImage: mask, WebkitMaskImage: mask }

  return (
    <div ref={ref} onScroll={measure} style={style} className={cn("overflow-y-auto overscroll-contain", className)}>
      {children}
    </div>
  )
}
