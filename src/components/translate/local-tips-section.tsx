"use client"

import { useState } from "react"

import { Section } from "@/components/rumbo/section"
import type { LocalTipView } from "@/lib/tips/view"

import { LocalTipCard } from "./local-tip-card"

/**
 * "Te recomendaron" en la home: lo que recomendaron personas locales en el viaje, para
 * revisarlo después de la charla. Las guardadas avisan al pasar cerca.
 */
export function LocalTipsSection({ tips, timeZone }: { tips: LocalTipView[]; timeZone: string }) {
  const [list, setList] = useState(tips)
  if (list.length === 0) return null
  return (
    <Section title="Te recomendaron">
      <div className="flex flex-col gap-2">
        {list.map((tip) => (
          <LocalTipCard
            key={tip.id}
            tip={tip}
            timeZone={timeZone}
            onChange={(next) => setList((prev) => prev.map((t) => (t.id === next.id ? next : t)))}
          />
        ))}
      </div>
    </Section>
  )
}
