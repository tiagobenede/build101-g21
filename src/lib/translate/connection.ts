const CALLS_URL = "https://api.openai.com/v1/realtime/translations/calls"
/**
 * Al pedir `session.close` el modelo manda de golpe lo que le faltaba traducir (mientras hay
 * silencio se lo guarda). Se corta al llegar `session.closed` (a veces no llega) o cuando deja
 * de mandar un rato, y nunca después del tope: se cobra mientras siga abierta.
 */
const CLOSE_QUIET_MS = 3_000
const CLOSE_MAX_MS = 10_000

export type TranslationEvent = { type: string; delta?: string; error?: { message?: string } }

export interface TranslationConnection {
  /** Cierra bien: `session.close`, recibe lo que faltaba traducir y corta. Deja de cobrar. */
  close: () => Promise<void>
}

/**
 * Una sesión de traducción por WebRTC: sube `track` y reproduce la traducción (salvo con
 * `muted`, cuando la voz la pone otro). Traduce de corrido, sin `response.create`.
 */
export async function connectTranslation({
  key,
  track,
  muted = false,
  onEvent,
}: {
  key: string
  track: MediaStreamTrack
  muted?: boolean
  onEvent: (event: TranslationEvent) => void
}): Promise<TranslationConnection> {
  const pc = new RTCPeerConnection()
  const audio = new Audio()
  audio.autoplay = true
  pc.ontrack = (e) => {
    if (!muted) audio.srcObject = e.streams[0]
  }
  pc.addTrack(track)

  let onClosed: (() => void) | null = null
  const dc = pc.createDataChannel("oai-events")
  let lastEventAt = Date.now()
  dc.onmessage = (e) => {
    lastEventAt = Date.now()
    try {
      const event = JSON.parse(e.data as string) as TranslationEvent
      if (event.type === "session.closed") onClosed?.()
      onEvent(event)
    } catch {
      // Ignorar mensajes no-JSON.
    }
  }

  const hangUp = () => {
    dc.onmessage = null
    dc.close()
    pc.close()
    audio.srcObject = null
  }

  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const res = await fetch(CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
    })
    if (!res.ok) throw new Error(`OpenAI rechazó la traducción (${res.status}).`)
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() })
  } catch (err) {
    hangUp()
    throw err
  }

  let closing: Promise<void> | null = null
  return {
    close: () =>
      (closing ??= (async () => {
        if (dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "session.close" }))
          const closedAt = Date.now()
          lastEventAt = closedAt
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              const now = Date.now()
              if (now - lastEventAt > CLOSE_QUIET_MS || now - closedAt > CLOSE_MAX_MS) done()
            }, 100)
            const done = () => {
              clearInterval(check)
              resolve()
            }
            onClosed = done
          })
        }
        hangUp()
      })()),
  }
}
