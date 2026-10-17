import { AppIcon } from "@/components/rumbo/app-icon"
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts"

import { AccountPicker } from "./account-picker"

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="animate-in fade-in slide-in-from-bottom-2 flex w-full max-w-sm flex-col items-center duration-500">
        <AppIcon />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Polo</h1>
        <p className="text-muted-foreground mt-1.5 text-center text-[15px]">
          Tu guía de viaje por voz. Sabe dónde estás, qué te gusta y cuánto tiempo tenés.
        </p>

        <section className="mt-10 w-full">
          <h2 className="text-muted-foreground mb-2 px-4 text-[13px] uppercase">Elegí una cuenta</h2>
          <AccountPicker accounts={DEMO_ACCOUNTS} />
          <p className="text-muted-foreground mt-2 px-4 text-[13px]">Cuentas de demo con un viaje de ejemplo en París.</p>
        </section>
      </div>
    </main>
  )
}
