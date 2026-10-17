"use client"

import { HomeIcon, MapIcon, UsersIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { UserAvatar } from "@/components/rumbo/user-avatar"
import { FALLBACK_TINT } from "@/lib/demo-accounts"
import { cn } from "@/lib/utils"

import { AgentLauncher } from "./agent-launcher"

export type TabBarUser = { initials: string; tint: string }

interface TabBarProps {
  me: TabBarUser | null
}

/**
 * Barra de abajo: inicio, mapa, el blob de Rumbo en el medio, viaje compartido y perfil.
 * El fondo difuso va en una capa aparte: un `backdrop-filter` en la barra haría que el
 * vuelo del blob (fixed) quede atrapado adentro.
 */
export function TabBar({ me }: TabBarProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="bg-card/85 border-border/60 absolute inset-0 border-t backdrop-blur-xl" />
      <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        <Tab href="/" label="Inicio" icon={HomeIcon} active={pathname === "/"} />
        <Tab href="/map" label="Mapa" icon={MapIcon} active={pathname === "/map"} />
        <div className="flex justify-center">
          <AgentLauncher />
        </div>
        <Tab href="/trip" label="Viaje" icon={UsersIcon} active={pathname === "/trip"} />
        <Tab href="/profile" label="Vos" active={pathname === "/profile"}>
          <UserAvatar
            initials={me?.initials ?? ""}
            tint={me?.tint ?? FALLBACK_TINT}
            className={cn("size-6 [&_[data-slot=avatar-fallback]]:text-[10px]", pathname === "/profile" && "ring-brand ring-2 ring-offset-1")}
          />
        </Tab>
      </div>
    </nav>
  )
}

interface TabProps {
  href: string
  label: string
  active: boolean
  icon?: LucideIcon
  children?: React.ReactNode
}

function Tab({ href, label, active, icon: Icon, children }: TabProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
        active ? "text-brand" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} /> : children}
      {label}
    </Link>
  )
}
