"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { resetFirstLoginProfile } from "@/lib/data/onboarding"
import { DEMO_ACCOUNTS, findDemoAccount } from "@/lib/demo-accounts"
import { createClient } from "@/lib/supabase/server"

const demoEmails = DEMO_ACCOUNTS.map((a) => a.email) as [string, ...string[]]
const loginSchema = z.object({ email: z.enum(demoEmails) })

export type LoginState = { error: string | null }

export async function loginAsDemo(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) return { error: "Cuenta demo inválida." }

  const password = process.env.DEMO_PASSWORD
  if (!password) return { error: "Falta DEMO_PASSWORD en .env.local." }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password })
  if (error) {
    console.error("[login] signInWithPassword failed", error.message)
    return { error: "No se pudo iniciar sesión. ¿Está corriendo Supabase local?" }
  }

  if (findDemoAccount(parsed.data.email)?.firstLogin) {
    try {
      await resetFirstLoginProfile(data.user.id)
    } catch (err) {
      console.error("[login]", err instanceof Error ? err.message : err)
      return { error: "No se pudo preparar la cuenta nueva." }
    }
    redirect("/onboarding")
  }

  redirect("/")
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
