/**
 * Carga la API de Google Maps (JavaScript) una sola vez, en el cliente. La key es pública
 * (va al navegador): en Google Cloud tiene que estar restringida por dominio y solo a Maps
 * JavaScript API. Los lugares y la geocodificación usan la key del server, no esta.
 */
import { importLibrary, setOptions } from "@googlemaps/js-api-loader"

/** Mapa de prueba de Google: alcanza para los marcadores avanzados (sin estilo propio). */
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID"

let configured = false

export type MapsLibraries = { maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary }

export async function loadGoogleMaps(): Promise<MapsLibraries> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.")
  if (!configured) {
    setOptions({ key, v: "weekly", language: "es" })
    configured = true
  }
  const [maps, marker] = await Promise.all([importLibrary("maps"), importLibrary("marker")])
  return { maps, marker }
}

/** Punto redondo con borde blanco (centrado en la coordenada). */
export function dotElement(color: string, size: number, opacity = 1): HTMLElement {
  const el = document.createElement("div")
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    background: color,
    border: `${size >= 18 ? 3 : 2}px solid #fff`,
    boxShadow: "0 1px 4px rgba(0,0,0,.3)",
    opacity: String(opacity),
    transform: "translateY(50%)",
  })
  return el
}
