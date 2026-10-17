import { NextResponse } from "next/server"

import { getTravelerContext } from "@/lib/data/session"
import { latLngSchema } from "@/lib/location/schema"
import { identifyPhoto, type VisionResult } from "@/lib/vision/identify"

/** Jev acepta hasta 16 MiB, pero B-4 manda JPEG de ~1024 px: esto alcanza y corta abusos. */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024
const MIME_TYPES = ["image/jpeg", "image/png"] as const

type VisionResponse = { success: true; data: VisionResult } | { success: false; error: string }

const fail = (status: number, error: string) => NextResponse.json<VisionResponse>({ success: false, error }, { status })

/**
 * "¿Qué estoy viendo?": recibe una foto (multipart, campo `photo`) y opcionalmente la
 * ubicación en vivo (`lat`, `lng`). Es un route handler y no una server action porque
 * tarda unos segundos y Next despacha las server actions de a una por cliente.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const photo = form?.get("photo")
  if (!(photo instanceof File)) return fail(400, "Falta la foto.")

  const mime = MIME_TYPES.find((t) => t === photo.type)
  if (!mime) return fail(415, "La foto tiene que ser JPEG o PNG.")
  if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) return fail(413, "La foto es muy grande (máximo 4 MB).")

  const location = latLngSchema.safeParse({ lat: Number(form?.get("lat")), lng: Number(form?.get("lng")) })
  const ctx = await getTravelerContext({ location: location.success ? location.data : null })

  try {
    const result = await identifyPhoto({ bytes: new Uint8Array(await photo.arrayBuffer()), mime }, ctx)
    return NextResponse.json<VisionResponse>({ success: true, data: result })
  } catch (err) {
    console.error("[vision] identify failed", err instanceof Error ? err.message : err)
    return fail(502, "No pude reconocer la foto. Probá de nuevo.")
  }
}
