import { createVolumeMeter, type VolumeMeter } from "@/lib/audio/volume-meter"

const CALLS_URL = "https://api.openai.com/v1/realtime/calls"

export type RealtimeEvent = { type: string; [key: string]: unknown }

export interface RealtimeConnection {
  conversationId: string
  /** false si el usuario no dio permiso de micrófono (solo texto). */
  hasMic: boolean
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
}

type SessionResponse =
  | { success: true; data: { key: string; conversationId: string } }
  | { success: false; error: string }

async function mintSession(): Promise<{ key: string; conversationId: string }> {
  const res = await fetch("/api/realtime/session", { method: "POST" })
  const body = (await res.json().catch(() => null)) as SessionResponse | null
  if (!body?.success) throw new Error(body && !body.success ? body.error : "No se pudo abrir la sesión de voz.")
  return body.data
}

/**
 * Abre WebRTC directo a OpenAI Realtime. El mic arranca cerrado (push-to-talk):
 * solo se envía audio mientras el usuario mantiene la sesión de habla abierta.
 */
export async function connectRealtime({ onEvent, onDisconnect }: ConnectOptions): Promise<RealtimeConnection> {
  const mic = await navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .catch(() => null)
  const track = mic?.getAudioTracks()[0] ?? null
  if (track) track.enabled = false

  let inputMeter: VolumeMeter | null = null
  let outputMeter: VolumeMeter | null = null
  const pc = new RTCPeerConnection()
  const audio = new Audio()
  audio.autoplay = true

  const cleanup = () => {
    inputMeter?.stop()
    outputMeter?.stop()
    mic?.getTracks().forEach((t) => t.stop())
    audio.srcObject = null
    pc.close()
  }

  try {
    const { key, conversationId } = await mintSession()

    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0]
      outputMeter = createVolumeMeter(e.streams[0])
    }
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) onDisconnect()
    }
    if (mic && track) {
      pc.addTrack(track, mic)
      inputMeter = createVolumeMeter(mic)
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" })
    }

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
      hasMic: Boolean(track),
      send: (event) => {
        if (dc.readyState === "open") dc.send(JSON.stringify(event))
      },
      setMicOpen: (open) => {
        if (track) track.enabled = open
      },
      setMuted: (muted) => {
        audio.muted = muted
      },
      inputVolume: () => (track?.enabled ? (inputMeter?.read() ?? 0) : 0),
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
