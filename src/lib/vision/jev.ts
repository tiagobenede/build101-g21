import "server-only"

import { askJevChoice, type JevChoice, type JevImage } from "@/lib/jev"
import { VISION } from "@/lib/tuning"

/**
 * Jev para "¿qué lugar se ve en la foto?": elige entre los lugares cercanos o "ninguno".
 * Límites de imagen de Jev: PNG o JPEG, cada lado entre 280 y 1568 px (ver `fit.ts`).
 */

const PHOTO_REF = "foto-del-viajero"

export type Photo = JevImage

export function askJev(photo: Photo, whereLabel: string, criteria: Record<string, string>): Promise<JevChoice> {
  return askJevChoice({
    state: { foto: PHOTO_REF, ubicacion: `El viajero está cerca de ${whereLabel}.` },
    instructions: "¿Qué lugar se ve en `foto`? El viajero sacó la foto desde donde está.",
    criteria,
    image: { ref: PHOTO_REF, photo },
    timeoutMs: VISION.jevTimeoutMs,
  })
}
