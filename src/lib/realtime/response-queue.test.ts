import { beforeEach, describe, expect, it } from "vitest"

import type { RealtimeEvent } from "./connection"
import { ResponseQueue } from "./response-queue"

let sent: RealtimeEvent[]
let queue: ResponseQueue

const types = () => sent.map((e) => e.type)
const done = (id: string, status = "completed") => queue.handle({ type: "response.done", response: { id, status } })

beforeEach(() => {
  sent = []
  queue = new ResponseQueue((e) => sent.push(e))
  queue.handle({ type: "response.created" })
})

describe("ResponseQueue", () => {
  it("manda el resultado y pide respuesta cuando termina la que llamó al tool", () => {
    queue.begin("c1", "r1")
    queue.resolve("c1", '{"ok":true}')
    expect(sent).toEqual([])

    done("r1")
    expect(types()).toEqual(["conversation.item.create", "response.create"])
    expect(sent[0].item).toMatchObject({ type: "function_call_output", call_id: "c1" })
    expect(queue.hasPending).toBe(false)
  })

  it("un resultado silencioso entra a la charla sin pedir otra respuesta", () => {
    queue.begin("c1", "r1")
    queue.resolve("c1", '{"ok":true}', undefined, { silent: true })
    done("r1")
    expect(types()).toEqual(["conversation.item.create"])
    expect(queue.hasPending).toBe(false)
  })

  it("si junto a uno silencioso hay otro que necesita respuesta, se pide una sola", () => {
    queue.begin("c1", "r1")
    queue.begin("c2", "r1")
    queue.resolve("c1", "{}", undefined, { silent: true })
    queue.resolve("c2", "{}")
    done("r1")
    expect(types()).toEqual(["conversation.item.create", "conversation.item.create", "response.create"])
  })

  it("si el resultado llega después, lo manda al llegar", () => {
    queue.begin("c1", "r1")
    done("r1")
    expect(sent).toEqual([])
    expect(queue.hasPending).toBe(true)

    queue.resolve("c1", "{}")
    expect(types()).toEqual(["conversation.item.create", "response.create"])
  })

  it("no pide respuesta mientras el usuario habla ni mientras el VAD responde", () => {
    queue.begin("c1", "r1")
    done("r1")
    queue.handle({ type: "input_audio_buffer.speech_started" })
    queue.resolve("c1", "{}")
    expect(types()).toEqual(["conversation.item.create"])

    queue.handle({ type: "input_audio_buffer.speech_stopped" })
    expect(types()).toEqual(["conversation.item.create"])

    // La respuesta del VAD ya ve el resultado: no hace falta otra.
    queue.handle({ type: "response.created" })
    done("r2")
    expect(types()).toEqual(["conversation.item.create"])
  })

  it("descarta el resultado si la respuesta fue interrumpida", () => {
    let submitted = false
    queue.begin("c1", "r1")
    done("r1", "cancelled")
    queue.resolve("c1", "{}", () => (submitted = true))
    expect(sent).toEqual([])
    expect(submitted).toBe(false)
    expect(queue.hasPending).toBe(false)
  })

  it("con dos tools, una sola respuesta cuando terminan los dos", () => {
    queue.begin("c1", "r1")
    queue.begin("c2", "r1")
    done("r1")
    queue.resolve("c1", "{}")
    expect(types()).toEqual(["conversation.item.create"])
    queue.resolve("c2", "{}")
    expect(types()).toEqual(["conversation.item.create", "conversation.item.create", "response.create"])
  })

  it("marca el resultado como tardío si la charla siguió mientras corría", () => {
    queue.begin("c1", "r1")
    done("r1")
    queue.handle({ type: "response.created" })
    done("r2")
    queue.resolve("c1", '{"places":[]}')
    expect(sent[0].item).toMatchObject({ output: '{"late":true,"result":{"places":[]}}' })
  })

  it("reintenta si chocó con una respuesta activa", () => {
    queue.handle({ type: "error", error: { code: "conversation_already_has_active_response" } })
    done("r9")
    expect(types()).toEqual(["response.create"])
  })
})
