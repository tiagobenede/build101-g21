import type { RealtimeEvent } from "./connection"

type Send = (event: RealtimeEvent) => void

type PendingCall = {
  responseId: string
  /** La respuesta que pidió el tool terminó bien (no fue interrumpida). */
  responseDone: boolean
  output: string | null
  onSubmit: (() => void) | null
  /** La charla siguió (hubo otra respuesta) mientras el tool corría. */
  late: boolean
  /** Entra a la conversación sin pedir otra respuesta (el agente ya contestó, ej. `remember`). */
  silent: boolean
}

type ResponseDone = { id?: string; status?: string }

/**
 * Ordena los resultados de los tools dentro de una llamada full-duplex.
 *
 * Con VAD el servidor crea una respuesta cada vez que el usuario deja de hablar,
 * y OpenAI rechaza un `response.create` si ya hay una activa. Esta cola:
 * - manda el `function_call_output` recién cuando la respuesta que pidió el tool
 *   terminó; si el usuario la interrumpió, el resultado se descarta;
 * - pide `response.create` solo cuando no hay una respuesta activa, nadie está
 *   hablando y no queda ningún tool pendiente (una sola respuesta para todos);
 * - si la charla siguió mientras el tool corría, marca el resultado con
 *   `late: true` para que el agente lo retome ("ya tengo lo que buscabas").
 *
 * Así el tool corre en segundo plano y la charla sigue mientras tanto.
 */
export class ResponseQueue {
  private active = false
  private speaking = false
  private needsResponse = false
  private readonly calls = new Map<string, PendingCall>()

  constructor(private readonly send: Send) {}

  /** Hay tools corriendo o esperando para entrar a la conversación. */
  get hasPending(): boolean {
    return this.calls.size > 0
  }

  /** Se llama con cada evento del servidor, antes que el resto del manejo. */
  handle(ev: RealtimeEvent): void {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        this.speaking = true
        break
      case "input_audio_buffer.speech_stopped":
        // El VAD va a crear su propia respuesta: la tratamos como activa desde ya.
        this.speaking = false
        this.active = true
        break
      case "response.created":
        // Esa respuesta ya ve los resultados enviados hasta acá.
        this.active = true
        this.needsResponse = false
        for (const call of this.calls.values()) if (call.responseDone) call.late = true
        break
      case "response.done":
        this.active = false
        this.settleResponse(ev.response as ResponseDone | undefined)
        this.flush()
        break
      case "error":
        // Si igual chocamos con una respuesta activa, se reintenta en el próximo response.done.
        if ((ev.error as { code?: string } | undefined)?.code === "conversation_already_has_active_response") {
          this.needsResponse = true
        }
        break
    }
  }

  /** El modelo pidió un tool (`response.function_call_arguments.done`). */
  begin(callId: string, responseId: string): void {
    this.calls.set(callId, { responseId, responseDone: false, output: null, onSubmit: null, late: false, silent: false })
  }

  /**
   * Llegó el resultado. `onSubmit` corre cuando entra a la conversación (no si se descarta).
   * Con `silent`, entra sin pedir otra respuesta: el agente ya dijo lo suyo.
   */
  resolve(callId: string, output: string, onSubmit?: () => void, { silent = false }: { silent?: boolean } = {}): void {
    const call = this.calls.get(callId)
    if (!call) return
    call.output = output
    call.onSubmit = onSubmit ?? null
    call.silent = silent
    this.trySubmit(callId, call)
    this.flush()
  }

  /** Pide una respuesta del agente (ej. llegó a un lugar) apenas se pueda, sin pisar otra. */
  request(): void {
    this.needsResponse = true
    this.flush()
  }

  private settleResponse(response: ResponseDone | undefined): void {
    if (!response?.id) return
    const completed = response.status !== "cancelled" && response.status !== "failed"
    for (const [callId, call] of this.calls) {
      if (call.responseId !== response.id) continue
      if (!completed) {
        this.calls.delete(callId)
        continue
      }
      call.responseDone = true
      this.trySubmit(callId, call)
    }
  }

  private trySubmit(callId: string, call: PendingCall): void {
    if (!call.responseDone || call.output === null) return
    this.calls.delete(callId)
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: call.late ? `{"late":true,"result":${call.output}}` : call.output,
      },
    })
    if (!call.silent) this.needsResponse = true
    call.onSubmit?.()
  }

  private flush(): void {
    if (!this.needsResponse || this.active || this.speaking || this.calls.size > 0) return
    this.needsResponse = false
    this.active = true
    this.send({ type: "response.create" })
  }
}
