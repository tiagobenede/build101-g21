import { z } from "zod"

/** Ubicación que manda el cliente (datos externos: siempre validar). */
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
