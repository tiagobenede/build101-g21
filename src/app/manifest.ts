import type { MetadataRoute } from "next"

/**
 * Manifest de la PWA. En iPhone, las notificaciones push solo funcionan si Polo está
 * agregado a la pantalla de inicio (Safari → Compartir → "Agregar a inicio").
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Polo",
    short_name: "Polo",
    description: "Tu guía de viaje por voz. Sabe dónde estás, qué te gusta y cuánto tiempo tenés.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F5F7",
    theme_color: "#F5F5F7",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
