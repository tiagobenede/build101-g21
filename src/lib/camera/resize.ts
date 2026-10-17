/**
 * Foto para `/api/vision`: JPEG de ~1024 px de lado mayor (lo que pide C-3; menos
 * bytes que subir desde el celular y el server la ajusta igual para Jev).
 */
export const PHOTO_MAX_SIDE = 1024
export const PHOTO_QUALITY = 0.85

/** Tamaño final: el lado mayor a `max` como mucho, sin agrandar ni deformar. */
export function fitSize(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Dibuja la imagen (cuadro del video o archivo) achicada y la devuelve como JPEG. */
export async function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const size = fitSize(width, height)
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No pude preparar la foto.")
  ctx.drawImage(source, 0, 0, size.width, size.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY))
  if (!blob) throw new Error("No pude preparar la foto.")
  return blob
}

/** Archivo elegido (cualquier formato que el navegador sepa abrir) → JPEG achicado. */
export async function fileToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("No pude abrir esa imagen.")
  })
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}
