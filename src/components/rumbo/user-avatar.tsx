import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  initials: string
  tint: string
  className?: string
}

export function UserAvatar({ initials, tint, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("size-10", className)}>
      <AvatarFallback className="text-sm font-medium text-white" style={{ backgroundColor: tint }}>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
