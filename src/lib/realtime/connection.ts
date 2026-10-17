import { createVolumeMeter, type VolumeMeter } from "@/lib/audio/volume-meter"
import type { LatLng } from "@/lib/geo"

const CALLS_URL = "https://api.openai.com/v1/realtime/calls"

export type RealtimeEvent = { type: string; [key: string]: unknown }

export interface RealtimeConnection {
  conversationId: string
  /** Pedido de saludo con el nombre del viajero (lo arma el server). */
  greeting: string
  send: (event: RealtimeEvent) => void
  setMicOpen: (open: boolean) => void
  setMuted: (muted: boolean) => void
  inputVolume: () => number
  outputVolume: () => number
  close: () => void
}

interface ConnectOptions {
  onEvent: (event: RealtimeEvent) => void
  onDisconnect: () => void
  /** Ubicación en vivo al abrir la sesión (va en las instrucciones). */
  location: LatLng | null
}

type SessionResponse =
  | { success: true; data: { key: string; conversationId: string; greeting: string } }
  | { success: false; error: string }

async function mintSession(location: LatLng | null): Promise<{ key: string; conversationId: string; greeting: string }> {
  const res = await fetch("/api/realtime/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location }),
  })
  const body = (await res.json().catch(() => null)) as SessionResponse | null
  if (!body?.success) throw new Error(body && !body.success ? body.error : "No se pudo abrir la sesión de voz.")
  return body.data
}

/**
 * Abre WebRTC directo a OpenAI Realtime con el mic del usuario. El track arranca
 * apagado; la llamada lo prende al conectar (y lo apaga al silenciarse).
 */
export async function connectRealtime({ onEvent, onDisconnect, location }: ConnectOptions): Promise<RealtimeConnection> {
  // Primero el mic: si no hay permiso, cortamos antes de abrir (y pagar) una sesión.
  const mic = await navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .catch(() => {
      throw new Error("Necesito permiso de micrófono para hablar con vos.")
    })
  const track = mic.getAudioTracks()[0]
  track.enabled = false

  let inputMeter: VolumeMeter | null = null
  let outputMeter: VolumeMeter | null = null
  const pc = new RTCPeerConnection()
  const audio = new Audio()
  audio.autoplay = true

  const cleanup = () => {
    inputMeter?.stop()
    outputMeter?.stop()
    mic.getTracks().forEach((t) => t.stop())
    audio.srcObject = null
    pc.close()
  }

  try {
    const { key, conversationId, greeting } = await mintSession(location)

    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0]
      outputMeter = createVolumeMeter(e.streams[0])
    }
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) onDisconnect()
    }
    pc.addTrack(track, mic)
    inputMeter = createVolumeMeter(mic)

    const dc = pc.createDataChannel("oai-events")
    dc.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data as string) as RealtimeEvent)
      } catch {
        // Ignorar mensajes no-JSON.
      }
    }
    const opened = new Promise<void>((resolve) => dc.addEventListener("open", () => resolve(), { once: true }))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const sdp = await fetch(CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
    })
    if (!sdp.ok) throw new Error(`OpenAI rechazó la conexión (${sdp.status}).`)
    await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() })
    await opened

    return {
      conversationId,
      greeting,
      send: (event) => {
        if (dc.readyState === "open") dc.send(JSON.stringify(event))
      },
      setMicOpen: (open) => {
        track.enabled = open
      },
      setMuted: (muted) => {
        audio.muted = muted
      },
      inputVolume: () => (track.enabled ? (inputMeter?.read() ?? 0) : 0),
      outputVolume: () => outputMeter?.read() ?? 0,
      close: () => {
        dc.onmessage = null
        pc.onconnectionstatechange = null
        dc.close()
        cleanup()
      },
    }
  } catch (err) {
    cleanup()
    throw err
  }
}
