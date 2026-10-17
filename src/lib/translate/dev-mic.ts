/**
 * Solo en desarrollo: un micrófono de mentira para probar el traductor de punta a punta
 * desde la consola, sin hablar (el navegador integrado no da micrófono). Lo que se escribe
 * se lee con la voz de `/api/tts` y entra por este mic a la traducción real.
 */

let mic: { ctx: AudioContext; dest: MediaStreamAudioDestinationNode } | null = null

/** Desde acá, `getUserMedia` de audio devuelve el mic de mentira. */
export function installDevMic() {
  if (mic) return
  const ctx = new AudioContext()
  mic = { ctx, dest: ctx.createMediaStreamDestination() }
  const devices = navigator.mediaDevices
  const real = devices.getUserMedia.bind(devices)
  devices.getUserMedia = async (constraints) => {
    if (!mic || !constraints?.audio) return real(constraints)
    await mic.ctx.resume()
    return new MediaStream([mic.dest.stream.getAudioTracks()[0].clone()])
  }
}

/** Dice `text` en `lang` por el mic de mentira; termina cuando se terminó de decir. */
export async function speakIntoDevMic(text: string, lang: string) {
  if (!mic) throw new Error("Falta installDevMic().")
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, kind: "phrase" }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const { ctx, dest } = mic
  await ctx.resume()
  const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(dest)
  await new Promise<void>((resolve) => {
    source.onended = () => resolve()
    source.start()
  })
}
