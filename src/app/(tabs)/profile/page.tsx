import { ChevronRightIcon, LogOutIcon } from "lucide-react"
import { Suspense } from "react"

import { logout } from "@/app/login/actions"
import { PushToggle } from "@/components/notifications/push-toggle"
import { InterestsEditor } from "@/components/profile/interests-editor"
import { PageSkeleton } from "@/components/rumbo/page-skeleton"
import { GroupedList, Section } from "@/components/rumbo/section"
import { UserAvatar } from "@/components/rumbo/user-avatar"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { INTEREST_TAGS } from "@/lib/agent/rank"
import { FALLBACK_TINT } from "@/lib/demo-accounts"
import { getTravelerContext } from "@/lib/data/session"

async function ProfileContent() {
  const ctx = await getTravelerContext()
  const { dietary, mobility, pace, schedule } = ctx.constraints
  const details = [
    ctx.homeCity && { label: "Vivís en", value: ctx.homeCity },
    ctx.travelStyle && { label: "Cómo viajás", value: ctx.travelStyle },
    pace && { label: "Ritmo", value: pace },
    schedule && { label: "Horario", value: schedule },
    dietary.length > 0 && { label: "Comida", value: dietary.join(", ") },
    mobility && { label: "Movilidad", value: mobility },
  ].filter((d): d is { label: string; value: string } => Boolean(d))

  return (
    <main className="animate-in fade-in mx-auto flex w-full max-w-md flex-col gap-8 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] duration-300">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <UserAvatar
          initials={ctx.account?.initials ?? ctx.fullName.slice(0, 2).toUpperCase()}
          tint={ctx.account?.tint ?? FALLBACK_TINT}
          className="size-20 [&_[data-slot=avatar-fallback]]:text-2xl"
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ctx.fullName}</h1>
          {ctx.account && <p className="text-muted-foreground text-[15px]">{ctx.account.email}</p>}
        </div>
      </div>

      <InterestsEditor interests={ctx.interests} options={INTEREST_TAGS} />

      {details.length > 0 && (
        <Section title="Sobre vos">
          <GroupedList>
            {details.map((d) => (
              <Item key={d.label} className="rounded-none px-4 py-3">
                <ItemContent>
                  <ItemTitle className="text-[15px]">{d.label}</ItemTitle>
                </ItemContent>
                <ItemActions className="text-muted-foreground text-[15px] capitalize">{d.value}</ItemActions>
              </Item>
            ))}
          </GroupedList>
        </Section>
      )}

      <Section title="Configuración">
        <GroupedList>
          <PushToggle />
        </GroupedList>
      </Section>

      <GroupedList>
        <form action={logout}>
          <Item asChild className="w-full rounded-none px-4 py-3 text-left hover:bg-muted/60">
            <button type="submit">
              <ItemMedia>
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#8E8E93] text-white">
                  <LogOutIcon className="size-[18px]" />
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-[15px] text-[#FF3B30]">Salir</ItemTitle>
                <ItemDescription className="text-[13px]">Cerrar sesión y cambiar de cuenta</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="text-muted-foreground/60 size-4" />
              </ItemActions>
            </button>
          </Item>
        </form>
      </GroupedList>
    </main>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfileContent />
    </Suspense>
  )
}
