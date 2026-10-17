import { NavigationIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function AppIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-foreground text-background flex size-14 items-center justify-center rounded-[16px] shadow-sm",
        className
      )}
    >
      <NavigationIcon className="size-1/2 fill-current" strokeWidth={1.5} />
    </span>
  )
}
