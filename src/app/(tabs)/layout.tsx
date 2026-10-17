import { connection } from "next/server"
import { Suspense } from "react"

import { TabBar } from "@/components/nav/tab-bar"
import { FALLBACK_TINT, findDemoAccount } from "@/lib/demo-accounts"
import { createClient } from "@/lib/supabase/server"

/** Pantallas con la barra de abajo. /talk queda afuera: es pantalla completa. */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={<TabBar me={null} />}>
        <TabBarWithMe />
      </Suspense>
    </>
  )
}

async function TabBarWithMe() {
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return <TabBar me={null} />
  const account = findDemoAccount(user.email)
  return (
    <TabBar
      me={{
        initials: account?.initials ?? (user.email ?? "").slice(0, 2).toUpperCase(),
        tint: account?.tint ?? FALLBACK_TINT,
      }}
    />
  )
}
