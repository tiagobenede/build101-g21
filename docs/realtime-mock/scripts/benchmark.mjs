// Sends the same text prompts to OpenAI Realtime and to the ElevenLabs agents over WebSocket,
// and records latency, cost and the spoken audio (saved as WAV so you can compare voices).
// Run from the project root: node --env-file=.env docs/realtime-mock/scripts/benchmark.mjs
// Note: input is text, so speech-recognition time is not included for either provider.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { INSTRUCTIONS } from "../shared.mjs";

const OUT = join(import.meta.dirname, "..", "benchmark-results");
const PROMPTS = [
  "Hi! What should I see in Madrid tomorrow?",
  "¿Dónde puedo comer buenas tapas cerca de la Puerta del Sol?",
  "Is the metro or a taxi better from the airport to the city center?",
  "¿Qué me recomiendas hacer en Barcelona si llueve?",
];

// gpt-realtime-2.1 prices per 1M tokens
const OAI_PRICE = { text_in: 4, audio_in: 32, cached_in: 0.4, text_out: 24, audio_out: 64 };
const EL_PRICE_PER_MIN = 0.08; // ElevenLabs Agents platform fee (LLM billed separately)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wav(pcm, sampleRate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Opens a WebSocket and exposes a queue of parsed JSON messages.
async function openSocket(url, protocols) {
  const ws = new WebSocket(url, protocols);
  const listeners = new Set();
  ws.onmessage = (e) => { const msg = JSON.parse(e.data); for (const l of listeners) l(msg); };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error(e.message || "WebSocket error")); });
  return { ws, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, send: (o) => ws.send(JSON.stringify(o)) };
}

async function runOpenAI() {
  const model = process.env.REALTIME_MODEL || "gpt-realtime-2.1";
  const s = await openSocket(`wss://api.openai.com/v1/realtime?model=${model}`, [
    "realtime", `openai-insecure-api-key.${process.env.OPENAI_API_KEY}`,
  ]);
  s.send({ type: "session.update", session: {
    type: "realtime", instructions: INSTRUCTIONS, output_modalities: ["audio"],
    audio: { output: { voice: process.env.VOICE || "marin" } },
  } });
  await sleep(500);

  const turns = [];
  for (const [i, prompt] of PROMPTS.entries()) {
    const t0 = performance.now();
    const turn = { prompt, firstAudioMs: null, text: "", audio: [], cost: 0 };
    await new Promise((resolve, reject) => {
      const off = s.on((ev) => {
        if (ev.type === "response.output_audio.delta") {
          turn.firstAudioMs ??= Math.round(performance.now() - t0);
          turn.audio.push(Buffer.from(ev.delta, "base64"));
        } else if (ev.type === "response.output_audio_transcript.delta") {
          turn.text += ev.delta;
        } else if (ev.type === "response.done") {
          const u = ev.response.usage ?? {};
          const inD = u.input_token_details ?? {}, outD = u.output_token_details ?? {};
          const cached = inD.cached_tokens ?? 0;
          turn.usage = { input: u.input_tokens, cached, output: u.output_tokens, audio_out: outD.audio_tokens };
          // Cached tokens are billed at the cached rate; split the rest by modality.
          const uncachedText = Math.max(0, (inD.text_tokens ?? 0) - (inD.cached_tokens_details?.text_tokens ?? 0));
          const uncachedAudio = Math.max(0, (inD.audio_tokens ?? 0) - (inD.cached_tokens_details?.audio_tokens ?? 0));
          turn.cost = (uncachedText * OAI_PRICE.text_in + uncachedAudio * OAI_PRICE.audio_in + cached * OAI_PRICE.cached_in
            + (outD.text_tokens ?? 0) * OAI_PRICE.text_out + (outD.audio_tokens ?? 0) * OAI_PRICE.audio_out) / 1e6;
          off(); resolve();
        } else if (ev.type === "error") {
          off(); reject(new Error(ev.error?.message));
        }
      });
      s.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] } });
      s.send({ type: "response.create" });
    });
    turn.totalMs = Math.round(performance.now() - t0);
    const pcm = Buffer.concat(turn.audio);
    turn.audioSec = +(pcm.length / 48000).toFixed(1); // pcm16 @ 24 kHz
    await writeFile(join(OUT, `openai-${i + 1}.wav`), wav(pcm, 24000));
    delete turn.audio;
    turns.push(turn);
  }
  s.ws.close();
  return { name: `OpenAI Realtime (${model})`, turns, totalCost: turns.reduce((a, t) => a + t.cost, 0) };
}

async function runElevenLabs(label, agentId) {
  const headers = { "xi-api-key": process.env.ELEVENLABS_API_KEY };
  const signed = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers }).then((r) => r.json());
  if (!signed.signed_url) throw new Error(`No signed URL: ${JSON.stringify(signed)}`);
  const s = await openSocket(signed.signed_url);

  let conversationId, sampleRate = 16000;
  s.on((ev) => { if (ev.type === "ping") s.send({ type: "pong", event_id: ev.ping_event.event_id }); });
  await new Promise((resolve) => {
    const off = s.on((ev) => {
      if (ev.type === "conversation_initiation_metadata") {
        const m = ev.conversation_initiation_metadata_event;
        conversationId = m.conversation_id;
        sampleRate = Number(/pcm_(\d+)/.exec(m.agent_output_audio_format)?.[1] ?? 16000);
        off(); resolve();
      }
    });
    s.send({ type: "conversation_initiation_client_data" });
  });
  const sessionStart = performance.now();

  const turns = [];
  for (const [i, prompt] of PROMPTS.entries()) {
    const t0 = performance.now();
    const turn = { prompt, firstAudioMs: null, firstTextMs: null, text: "", audio: [] };
    await new Promise((resolve) => {
      let quiet;
      const done = () => { off(); resolve(); };
      const bump = () => { clearTimeout(quiet); quiet = setTimeout(done, 2500); }; // turn ends after 2.5 s of no audio
      const off = s.on((ev) => {
        if (ev.type === "audio") {
          turn.firstAudioMs ??= Math.round(performance.now() - t0);
          turn.audio.push(Buffer.from(ev.audio_event.audio_base_64, "base64"));
          bump();
          if (ev.audio_event.is_final) { clearTimeout(quiet); setTimeout(done, 300); }
        } else if (ev.type === "agent_response") {
          turn.firstTextMs ??= Math.round(performance.now() - t0);
          turn.text += ev.agent_response_event.agent_response;
          bump();
        }
      });
      s.send({ type: "user_message", text: prompt });
      setTimeout(done, 30000); // safety net
    });
    const pcm = Buffer.concat(turn.audio);
    turn.audioSec = +(pcm.length / (sampleRate * 2)).toFixed(1);
    turn.totalMs = Math.round(performance.now() - t0) - 2500; // minus the silence wait
    await writeFile(join(OUT, `elevenlabs-${label}-${i + 1}.wav`), wav(pcm, sampleRate));
    delete turn.audio;
    turns.push(turn);
  }
  const sessionMin = (performance.now() - sessionStart) / 60000;
  s.ws.close();

  // ElevenLabs reports what the conversation actually cost once it's processed.
  let details = null;
  for (let tries = 0; tries < 10; tries++) {
    await sleep(3000);
    details = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, { headers }).then((r) => r.json());
    if (details.status === "done" || details.status === "failed") break;
  }
  const md = details?.metadata ?? {};
  return {
    name: `ElevenLabs Agents (${label})`, turns, conversationId,
    sessionMin: +sessionMin.toFixed(2),
    estimatedCost: +(sessionMin * EL_PRICE_PER_MIN).toFixed(4),
    reported: { status: details?.status, cost: md.cost, call_duration_secs: md.call_duration_secs, charging: md.charging },
  };
}

await mkdir(OUT, { recursive: true });
const results = [];
for (const [label, run] of [
  ["openai", () => runOpenAI()],
  ["luna", () => runElevenLabs("gpt-6-luna", process.env.ELEVENLABS_AGENT_LUNA)],
  ["haiku", () => runElevenLabs("claude-haiku-5-5", process.env.ELEVENLABS_AGENT_HAIKU)],
]) {
  if (process.argv[2] && process.argv[2] !== label) continue;
  try {
    console.error(`Running ${label}…`);
    results.push(await run());
  } catch (err) {
    results.push({ name: label, error: String(err.message ?? err) });
  }
}
await writeFile(join(OUT, `results${process.argv[2] ? "-" + process.argv[2] : ""}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
