export type DemoAccount = {
  email: string
  name: string
  tagline: string
  initials: string
  /** Color del avatar (colores de sistema de iOS). */
  tint: string
  /** Primer login: cada vez que entra se borra su perfil y arranca el onboarding. */
  firstLogin?: boolean
  /** Dónde arranca la ubicación simulada al entrar (para la demo); sin esto, donde haya quedado. */
  start?: { lat: number; lng: number }
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: "tiago@rumbo.demo", name: "Tiago", tagline: "Autos, diseño y café", initials: "T", tint: "#FF9F0A" },
  // Guion de la demo (docs/pitch/casos-jurado.md): Lucas en la Rue de Rivoli, a ~290 m del Louvre (camina
  // hasta la Pirámide y ahí le llega el aviso), Nicolas en Union Square.
  { email: "lucas@rumbo.demo", name: "Lucas", tagline: "Museos, historia y librerías", initials: "L", tint: "#5E5CE6", start: { lat: 48.86271, lng: 2.33531 } },
  { email: "nicolas@rumbo.demo", name: "Nicolas", tagline: "Comida, mercados y parques", initials: "N", tint: "#30B0C7", start: { lat: 40.7359, lng: -73.9911 } },
  { email: "nuevo@rumbo.demo", name: "Alex Romero", tagline: "Primer login: arranca con el onboarding", initials: "AR", tint: "#34C759", firstLogin: true },
]

export const FALLBACK_TINT = "#8E8E93"

export function findDemoAccount(email: string | undefined | null): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.email === email)
}
