import sharp from "sharp"

import type { Photo } from "./jev"

/** Jev rechaza la imagen entera si algún lado está fuera de este rango (no la achica). */
export const JEV_MIN_SIDE = 280
export const JEV_MAX_SIDE = 1568

/**
 * Ajusta la foto a lo que acepta Jev: lado largo ≤ 1568 px y lado corto ≥ 280 px.
 * Si ya entra, la devuelve igual. Si es tan apaisada que no puede cumplir las dos
 * cosas, también la devuelve igual: Jev la rechaza y responde el LLM.
 */
export async function fitForJev(photo: Photo): Promise<Photo> {
  const { width, height } = await sharp(photo.bytes).metadata()
  if (!width || !height) return photo

  const long = Math.max(width, height)
  const short = Math.min(width, height)
  if (short >= JEV_MIN_SIDE && long <= JEV_MAX_SIDE) return photo

  const scale = long > JEV_MAX_SIDE ? JEV_MAX_SIDE / long : JEV_MIN_SIDE / short
  if (Math.round(short * scale) < JEV_MIN_SIDE || Math.round(long * scale) > JEV_MAX_SIDE) return photo

  const resized = sharp(photo.bytes).resize(Math.round(width * scale), Math.round(height * scale))
  const out = photo.mime === "image/png" ? resized.png() : resized.jpeg({ quality: 85 })
  return { bytes: new Uint8Array(await out.toBuffer()), mime: photo.mime }
}
