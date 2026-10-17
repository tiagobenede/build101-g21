"use client"

import { ChevronRightIcon } from "lucide-react"
import { Fragment, useActionState, useEffect, useState } from "react"
import { toast } from "sonner"

import { UserAvatar } from "@/components/rumbo/user-avatar"
import { Card } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { DemoAccount } from "@/lib/demo-accounts"

import { loginAsDemo, type LoginState } from "./actions"

interface AccountPickerProps {
  accounts: readonly DemoAccount[]
}

const INITIAL_STATE: LoginState = { error: null }

export function AccountPicker({ accounts }: AccountPickerProps) {
  const [state, formAction, pending] = useActionState(loginAsDemo, INITIAL_STATE)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  return (
    <form action={formAction}>
      <Card className="gap-0 overflow-hidden py-0 shadow-none ring-0">
        {accounts.map((account, i) => (
          <Fragment key={account.email}>
            {i > 0 && <Separator className="ml-[68px] w-auto" />}
            <Item asChild className="rounded-none px-4 py-3 hover:bg-muted/60">
              <button
                type="submit"
                name="email"
                value={account.email}
                disabled={pending}
                onClick={() => setSelected(account.email)}
                className="text-left disabled:cursor-wait"
              >
                <ItemMedia>
                  <UserAvatar initials={account.initials} tint={account.tint} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="text-[15px]">{account.name}</ItemTitle>
                  <ItemDescription className="text-[13px]">{account.tagline}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  {pending && selected === account.email ? (
                    <Spinner className="text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="text-muted-foreground/60 size-4" />
                  )}
                </ItemActions>
              </button>
            </Item>
          </Fragment>
        ))}
      </Card>
    </form>
  )
}
