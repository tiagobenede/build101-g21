"use client"

import { ImageUpIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { fileToJpeg, toJpeg } from "@/lib/camera/resize"

interface CameraSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** JPEG de ~1024 px listo para `/api/vision`. */
  onPhoto: (photo: Blob) => void
}

/**
 * "¿Qué estoy viendo?": la cámara trasera en vivo a pantalla completa, como la cámara del
 * teléfono, o una foto del carrete. La cámara se prende solo mientras está abierta.
 */
export function CameraSheet({ open, onOpenChange, onPhoto }: CameraSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camera, setCamera] = useState<"starting" | "on" | "unavailable">("starting")

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let cancelled = false
    // Sin `mediaDevices` (http fuera de localhost) getUserMedia no existe: queda subir una foto.
    const request = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false })
      : Promise.reject(new Error("sin cámara"))
    request
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        streamRef.current = s
        setCamera("on")
      })
      .catch(() => {
        if (!cancelled) setCamera("unavailable")
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setCamera("starting")
    }
  }, [open])

  // El video se monta al abrir: el stream se engancha cuando ya está.
  useEffect(() => {
    if (camera === "on" && videoRef.current) videoRef.current.srcObject = streamRef.current
  }, [camera])

  // Escape cierra (en la compu).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const take = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    onPhoto(await toJpeg(video, video.videoWidth, video.videoHeight))
    onOpenChange(false)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    try {
      onPhoto(await fileToJpeg(file))
      onOpenChange(false)
    } catch {
      setCamera("unavailable")
    }
  }

  if (!open) return null

  return (
    <div role="dialog" aria-modal aria-label="¿Qué estás viendo?" className="animate-in fade-in fixed inset-0 z-50 bg-black duration-200">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
      {camera !== "on" && (
        <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-[15px] text-white/80">
          {camera === "starting" ? "Prendiendo la cámara…" : "No hay cámara disponible. Subí una foto."}
        </p>
      )}

      {/* Arriba: cerrar y el título, sobre un degradé para que se lean con cualquier imagen. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Cerrar cámara"
          className="rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
          onClick={() => onOpenChange(false)}
        >
          <XIcon className="size-5" />
        </Button>
        <p className="text-[17px] font-semibold text-white">¿Qué estás viendo?</p>
        <span className="size-9" />
      </div>

      {/* Abajo: la pista, el carrete a la izquierda y el disparador en el medio. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 bg-gradient-to-t from-black/70 to-transparent px-6 pt-16 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="rounded-full bg-black/40 px-3 py-1.5 text-[14px] text-white backdrop-blur">Sacale una foto y te digo qué es</p>
        <div className="grid w-full grid-cols-3 items-center">
          <button
            type="button"
            aria-label="Subir foto"
            onClick={() => fileRef.current?.click()}
            className="flex size-12 items-center justify-center justify-self-start rounded-full bg-white/20 text-white backdrop-blur"
          >
            <ImageUpIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Sacar foto"
            disabled={camera !== "on"}
            onClick={() => void take()}
            className="size-[76px] justify-self-center rounded-full border-4 border-white p-1 disabled:opacity-50"
          >
            <span className="block size-full rounded-full bg-white transition-transform active:scale-90" />
          </button>
          <span />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files?.[0])
          e.target.value = ""
        }}
      />
    </div>
  )
}
