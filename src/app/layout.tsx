import type { Metadata, Viewport } from "next"

import { LocationProvider } from "@/components/location/location-provider"
import { NotificationsProvider } from "@/components/notifications/notifications-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

export const metadata: Metadata = {
  title: "Rumbo",
  description: "Asistente de viaje por voz que conoce tus gustos, tu ubicación y tu tiempo.",
}

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full">
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <LocationProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </LocationProvider>
        </TooltipProvider>
        <Toaster theme="light" position="top-center" />
      </body>
    </html>
  )
}
