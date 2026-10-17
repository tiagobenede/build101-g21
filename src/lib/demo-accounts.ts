export type DemoAccount = {
  email: string
  name: string
  tagline: string
  initials: string
  /** Color del avatar (colores de sistema de iOS). */
  tint: string
  /** Primer login: cada vez que entra se borra su perfil y arranca el onboarding. */
  firstLogin?: boolean
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: "sofia@rumbo.demo", name: "Sofía Álvarez", tagline: "Autos, diseño y café", initials: "SA", tint: "#FF9F0A" },
  { email: "mateo@rumbo.demo", name: "Mateo Rossi", tagline: "Museos, historia y librerías", initials: "MR", tint: "#5E5CE6" },
  { email: "lucia@rumbo.demo", name: "Lucía Méndez", tagline: "Comida, mercados y parques", initials: "LM", tint: "#30B0C7" },
  { email: "nuevo@rumbo.demo", name: "Alex Romero", tagline: "Primer login: arranca con el onboarding", initials: "AR", tint: "#34C759", firstLogin: true },
]

export const FALLBACK_TINT = "#8E8E93"

export function findDemoAccount(email: string | undefined | null): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.email === email)
}
