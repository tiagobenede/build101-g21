import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SectionProps {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Section({ title, action, children, className }: SectionProps) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Lista agrupada estilo iOS: card blanca con filas separadas. */
export function GroupedList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-0 rounded-2xl py-0 shadow-none ring-0 [&>[data-slot=item]:not(:last-child)]:border-b-border", className)}>
      {children}
    </Card>
  )
}
