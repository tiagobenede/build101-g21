"use client"

import { CameraIcon, ImageUpIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { fileToJpeg, toJpeg } from "@/lib/camera/resize"

interface CameraSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** JPEG de ~1024 px listo para `/api/vision`. */
  onPhoto: (photo: Blob) => void
}

/**
 * "¿Qué estoy viendo?": la cámara trasera en vivo o una foto del carrete. La cámara
 * se prende solo mientras el panel está abierto.
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

  // El video se monta con el panel (que anima): el stream se engancha cuando ya está.
  useEffect(() => {
    if (camera === "on" && videoRef.current) videoRef.current.srcObject = streamRef.current
  }, [camera])

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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0">
            <DrawerTitle>¿Qué estás viendo?</DrawerTitle>
            <DrawerDescription>Sacale una foto y te digo qué es.</DrawerDescription>
          </DrawerHeader>

          <div className="bg-muted relative aspect-[3/4] max-h-[50vh] overflow-hidden rounded-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            {camera !== "on" && (
              <p className="text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center text-[15px]">
                {camera === "starting" ? "Prendiendo la cámara…" : "No hay cámara disponible. Subí una foto."}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button size="lg" className="h-14 flex-1 rounded-full text-base" disabled={camera !== "on"} onClick={() => void take()}>
              <CameraIcon className="size-5" />
              Sacar foto
            </Button>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Subir foto"
              className="size-14 shrink-0 rounded-full [&_svg]:size-5"
              onClick={() => fileRef.current?.click()}
            >
              <ImageUpIcon />
            </Button>
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
      </DrawerContent>
    </Drawer>
  )
}
