import { LogOutIcon, MapPinIcon } from "lucide-react"

import { logout } from "@/app/login/actions"
import { UserAvatar } from "@/components/rumbo/user-avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FALLBACK_TINT, type DemoAccount } from "@/lib/demo-accounts"

interface AppHeaderProps {
  account: DemoAccount | undefined
  fullName: string
  subtitle: string
}

export function AppHeader({ account, fullName, subtitle }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-[13px] font-medium">
        <MapPinIcon className="text-brand size-3.5 shrink-0" />
        <span className="truncate">{subtitle}</span>
      </p>
      <div className="flex items-center gap-1">
        <UserAvatar
          initials={account?.initials ?? fullName.slice(0, 2).toUpperCase()}
          tint={account?.tint ?? FALLBACK_TINT}
          className="size-8"
        />
        <form action={logout}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Cambiar de cuenta">
                <LogOutIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cambiar de cuenta</TooltipContent>
          </Tooltip>
        </form>
      </div>
    </header>
  )
}
