import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { joinTrip } from "@/lib/data/trips"
import { createClient } from "@/lib/supabase/server"

type JoinTripProps = { params: Promise<{ code: string }> }

/** Link de invitación a un viaje compartido: suma al viaje y lleva a la home. */
export default function JoinTripPage({ params }: JoinTripProps) {
  // Lee la sesión y la URL al momento del pedido: va dentro de Suspense (cacheComponents).
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <JoinTrip params={params} />
    </Suspense>
  )
}

async function JoinTrip({ params }: JoinTripProps) {
  const { code } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const r = await joinTrip(supabase, code)
  if (r.ok) redirect("/")

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">No pude sumarte al viaje</h1>
      <p className="text-muted-foreground text-[15px]">{r.error}</p>
      <Button asChild className="rounded-full">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  )
}
