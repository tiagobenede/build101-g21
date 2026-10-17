// Browser side: connects straight to OpenAI over WebRTC using short-lived keys from our server.

const $ = (id) => document.getElementById(id);

const LANGS = { en: "English", es: "Spanish", pt: "Portuguese", fr: "French", it: "Italian", de: "German", ja: "Japanese" };
for (const sel of [$("myLang"), $("theirLang")]) {
  for (const [code, name] of Object.entries(LANGS)) sel.add(new Option(name, code));
}
$("myLang").value = "en";
$("theirLang").value = "es";

function logLine(el, text, cls = "") {
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.textContent = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

function setStatus(el, text, kind = "") {
  el.textContent = text;
  el.className = `status ${kind}`;
}

async function getKey(path) {
  const res = await fetch(path, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(`${data.error}${data.details ? ": " + JSON.stringify(data.details) : ""}`);
  return data.value;
}

// Opens one WebRTC connection: sends `track` up, plays the remote audio, returns the event channel.
async function connect({ key, callsUrl, track, onEvent }) {
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
  pc.addTrack(track);

  const dc = pc.createDataChannel("oai-events");
  dc.addEventListener("message", (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore non-JSON */ }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const res = await fetch(callsUrl, {
    method: "POST",
    body: offer.sdp,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
  });
  if (!res.ok) throw new Error(`SDP exchange failed (${res.status}): ${await res.text()}`);
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  return { pc, dc, audio, close() { dc.close(); pc.close(); audio.srcObject = null; } };
}

// ---------- 1. Realtime agent ----------

const AGENT_IDLE_MS = 60000; // hang up after a minute with nobody talking

let agent = null;
let agentMic = null;
let agentIdle = null;
let agentLastActivity = 0;

$("agentStart").onclick = async () => {
  const status = $("agentStatus"), log = $("agentLog"), events = $("agentEvents");
  $("agentStart").disabled = true;
  try {
    setStatus(status, "Getting mic…");
    agentMic = await navigator.mediaDevices.getUserMedia({ audio: true });
    setStatus(status, "Minting session key…");
    const key = await getKey("/api/session");
    setStatus(status, "Connecting…");

    let current = null; // transcript line being streamed
    agent = await connect({
      key,
      callsUrl: "https://api.openai.com/v1/realtime/calls",
      track: agentMic.getAudioTracks()[0],
      onEvent(ev) {
        if (!ev.type.endsWith(".delta")) logLine(events, ev.type, "sys");
        if (ev.type === "input_audio_buffer.speech_started" || ev.type.startsWith("response.")) agentLastActivity = Date.now();
        switch (ev.type) {
          case "session.created":
            setStatus(status, `Connected (${ev.session?.model ?? "realtime"}). Say hi!`, "ok");
            break;
          case "input_audio_buffer.speech_started":
            setStatus(status, "Listening…", "ok");
            break;
          case "input_audio_buffer.speech_stopped":
            setStatus(status, "Thinking…", "ok");
            break;
          case "response.output_audio_transcript.delta":
          case "response.audio_transcript.delta":
            current ??= logLine(log, "Agent: ");
            current.textContent += ev.delta;
            break;
          case "response.done":
            billing.addAgentUsage(ev.response?.usage);
            current = null;
            setStatus(status, "Connected. Your turn.", "ok");
            break;
          case "conversation.item.input_audio_transcription.completed":
            logLine(log, `You: ${ev.transcript}`, "you");
            break;
          case "error":
            logLine(log, `Error: ${ev.error?.message ?? JSON.stringify(ev)}`, "err");
            break;
        }
      },
    });
    agent.pc.onconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(agent?.pc.connectionState)) setStatus(status, `Connection ${agent.pc.connectionState}`, "err");
    };
    agentLastActivity = Date.now();
    agentIdle = setInterval(() => {
      if (Date.now() - agentLastActivity > AGENT_IDLE_MS) {
        stopAgent();
        setStatus(status, "Stopped after a minute of silence");
      }
    }, 5000);
    $("agentStop").disabled = false;
    $("agentMute").disabled = false;
  } catch (err) {
    setStatus(status, "Failed", "err");
    logLine(log, String(err.message ?? err), "err");
    stopAgent();
  }
};

function stopAgent() {
  clearInterval(agentIdle);
  agent?.close();
  agent = null;
  agentMic?.getTracks().forEach((t) => t.stop());
  agentMic = null;
  $("agentStart").disabled = false;
  $("agentStop").disabled = true;
  $("agentMute").disabled = true;
  $("agentMute").textContent = "Mute mic";
}

$("agentStop").onclick = () => { stopAgent(); setStatus($("agentStatus"), "Stopped"); };
$("agentMute").onclick = () => {
  const track = agentMic?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("agentMute").textContent = track.enabled ? "Mute mic" : "Unmute mic";
};

// ---------- 1b. ElevenLabs agent ----------

// ElevenLabs bills every minute the session is open, so hang up after a minute of silence.
let elConv = null;
let elIdle = null;
let elLastActivity = 0;

$("elStart").onclick = async () => {
  const status = $("elStatus"), log = $("elLog");
  $("elStart").disabled = true;
  try {
    setStatus(status, "Loading SDK…");
    const { Conversation } = await import("https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm");
    setStatus(status, "Getting token…");
    const res = await fetch(`/api/elevenlabs-token?agent=${$("elAgent").value}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error}${data.details ? ": " + JSON.stringify(data.details) : ""}`);
    setStatus(status, "Connecting…");
    elConv = await Conversation.startSession({
      conversationToken: data.token,
      connectionType: "webrtc",
      onConnect: () => { billing.startEl(); setStatus(status, "Connected. Say hi!", "ok"); },
      onDisconnect: () => { billing.stopEl(); setStatus(status, "Disconnected"); },
      onModeChange: ({ mode }) => {
        elLastActivity = Date.now();
        setStatus(status, mode === "speaking" ? "Speaking…" : "Listening…", "ok");
      },
      onMessage: ({ source, message }) => {
        elLastActivity = Date.now();
        logLine(log, `${source === "user" ? "You" : "Agent"}: ${message}`, source === "user" ? "you" : "");
      },
      onError: (msg) => logLine(log, `Error: ${msg}`, "err"),
    });
    elLastActivity = Date.now();
    elIdle = setInterval(async () => {
      if (Date.now() - elLastActivity > AGENT_IDLE_MS) {
        await stopEl();
        setStatus(status, "Stopped after a minute of silence");
      }
    }, 5000);
    $("elStop").disabled = false;
  } catch (err) {
    setStatus(status, "Failed", "err");
    logLine(log, String(err.message ?? err), "err");
    $("elStart").disabled = false;
  }
};

async function stopEl() {
  clearInterval(elIdle);
  await elConv?.endSession();
  elConv = null;
  billing.stopEl();
  $("elStart").disabled = false;
  $("elStop").disabled = true;
}

$("elStop").onclick = async () => { await stopEl(); setStatus($("elStatus"), "Stopped"); };

// ---------- 2. Face-to-face translator ----------
// The translator is billed per minute a session is open, silence included, so a session only
// exists while someone is speaking: pressing a button opens that direction, and releasing it
// closes the session once the translation has finished playing.
// Direction "me":   my speech    -> their language
// Direction "them": their speech -> my language

const FLUSH_QUIET_MS = 2500; // close this long after the last translated words
const FLUSH_MAX_MS = 10000;  // never wait longer than this after release
const ACTIVE_MAX_MS = 60000; // auto-release a direction after a minute without translated output

let trMic = null;
let active = null; // { name, conn, track, openedAt, releasing, lastOutputAt, idleTimer }

async function openDirection(name) {
  const targetLang = name === "me" ? $("theirLang").value : $("myLang").value;
  const label = name === "me" ? "Me" : "Them";
  const track = trMic.getAudioTracks()[0].clone();
  const session = { name, track, conn: null, openedAt: 0, releasing: false, lastOutputAt: Date.now() };
  active = session;
  setButtons();
  setStatus($("trStatus"), "Connecting… (start speaking when it says Speak now)");

  const key = await getKey(`/api/translate-session?lang=${targetLang}`);
  let line = null;
  session.conn = await connect({
    key,
    callsUrl: "https://api.openai.com/v1/realtime/translations/calls",
    track,
    onEvent(ev) {
      if (!ev.type.endsWith(".delta")) logLine($("trEvents"), `[${name}] ${ev.type}`, "sys");
      if (ev.type === "session.output_transcript.delta") {
        session.lastOutputAt = Date.now();
        line ??= logLine($("trLog"), `${label} → ${LANGS[targetLang]}: `, name === "me" ? "you" : "");
        line.textContent += ev.delta;
        clearTimeout(line._t);
        line._t = setTimeout(() => { line = null; }, 1500); // start a new line after a pause
      } else if (ev.type === "session.closed") {
        session.closedByServer?.();
      } else if (ev.type === "error") {
        logLine($("trLog"), `[${name}] Error: ${ev.error?.message ?? JSON.stringify(ev)}`, "err");
      }
    },
  });
  session.openedAt = Date.now();
  billing.trackTranslator(session);
  if (active !== session) return closeSession(session); // released while connecting
  setStatus($("trStatus"), `Speak now: translating ${name === "me" ? "you" : "them"} → ${LANGS[targetLang]}`, "ok");
  session.idleTimer = setInterval(() => {
    if (Date.now() - session.lastOutputAt > ACTIVE_MAX_MS) {
      logLine($("trLog"), "Auto-stopped after a minute without speech.", "sys");
      releaseDirection();
    }
  }, 5000);
}

// Stop sending the mic, let the last words finish translating, then close the session.
async function releaseDirection() {
  const session = active;
  if (!session || session.releasing) return;
  session.releasing = true;
  active = null;
  session.track.enabled = false;
  setButtons();
  if (!session.conn) return; // still connecting; openDirection closes it when ready
  setStatus($("trStatus"), "Finishing translation…");
  const releasedAt = Date.now();
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const now = Date.now();
      if (now - Math.max(session.lastOutputAt, releasedAt) > FLUSH_QUIET_MS || now - releasedAt > FLUSH_MAX_MS) {
        clearInterval(check);
        resolve();
      }
    }, 250);
  });
  await closeSession(session);
  if (!active) setStatus($("trStatus"), "Ready. Nothing is billed until you press a button.", "ok");
}

// Ends a translation session properly: session.close, wait for session.closed, then hang up.
async function closeSession(session) {
  clearInterval(session.idleTimer);
  if (session.conn && !session.closed) {
    if (session.conn.dc.readyState === "open") {
      session.conn.dc.send(JSON.stringify({ type: "session.close" }));
      await new Promise((resolve) => {
        session.closedByServer = resolve;
        setTimeout(resolve, 3000);
      });
    }
    session.conn.close();
  }
  session.closed = true;
  session.track.stop();
  billing.stopTranslator(session);
}

function setButtons() {
  const ready = !!trMic;
  $("speakMe").disabled = !ready;
  $("speakThem").disabled = !ready;
  $("speakMe").classList.toggle("active", active?.name === "me");
  $("speakThem").classList.toggle("active", active?.name === "them");
}

async function press(name) {
  if (active?.name === name) return releaseDirection(); // tapped again: stop
  if (active) releaseDirection();                        // switching speakers
  try {
    await openDirection(name);
  } catch (err) {
    setStatus($("trStatus"), "Failed", "err");
    logLine($("trLog"), String(err.message ?? err), "err");
    if (active?.name === name) { active = null; setButtons(); }
  }
}

$("trStart").onclick = async () => {
  $("trStart").disabled = true;
  try {
    setStatus($("trStatus"), "Getting mic…");
    trMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    $("trStop").disabled = false;
    setButtons();
    setStatus($("trStatus"), "Ready. Nothing is billed until you press a button.", "ok");
  } catch (err) {
    setStatus($("trStatus"), "Failed", "err");
    logLine($("trLog"), String(err.message ?? err), "err");
    $("trStart").disabled = false;
  }
};

async function stopTranslator() {
  const session = active;
  active = null;
  if (session) await closeSession(session);
  trMic?.getTracks().forEach((t) => t.stop());
  trMic = null;
  $("trStart").disabled = false;
  $("trStop").disabled = true;
  setButtons();
}

$("trStop").onclick = async () => { await stopTranslator(); setStatus($("trStatus"), "Stopped"); };

// Hold to talk, or tap to toggle.
for (const [btn, name] of [[$("speakMe"), "me"], [$("speakThem"), "them"]]) {
  let downAt = 0;
  btn.addEventListener("pointerdown", () => { downAt = Date.now(); press(name); });
  btn.addEventListener("pointerup", () => {
    if (Date.now() - downAt > 400 && active?.name === name) releaseDirection(); // released after holding
  });
}

// ---------- Cost counter ----------
// Estimates from list prices: the translator by open minutes, the agent from each response's usage.

const TRANSLATE_PER_MIN = 0.034;
const EL_PER_MIN = 0.08; // ElevenLabs platform fee; LLM adds ~$0.001-0.002/min
const REALTIME_PRICE = { text_in: 4, audio_in: 32, cached_in: 0.4, text_out: 24, audio_out: 64 }; // per 1M tokens

const billing = {
  agent: 0,
  translatorMs: 0,
  open: new Set(),
  addAgentUsage(u = {}) {
    const inD = u.input_token_details ?? {}, outD = u.output_token_details ?? {};
    const cachedD = inD.cached_tokens_details ?? {};
    this.agent += (
      Math.max(0, (inD.text_tokens ?? 0) - (cachedD.text_tokens ?? 0)) * REALTIME_PRICE.text_in
      + Math.max(0, (inD.audio_tokens ?? 0) - (cachedD.audio_tokens ?? 0)) * REALTIME_PRICE.audio_in
      + (inD.cached_tokens ?? 0) * REALTIME_PRICE.cached_in
      + (outD.text_tokens ?? 0) * REALTIME_PRICE.text_out
      + (outD.audio_tokens ?? 0) * REALTIME_PRICE.audio_out
    ) / 1e6;
    this.render();
  },
  elMs: 0,
  elSince: null,
  startEl() { this.elSince ??= Date.now(); },
  stopEl() {
    if (this.elSince == null) return;
    this.elMs += Date.now() - this.elSince;
    this.elSince = null;
    this.render();
  },
  trackTranslator(session) { this.open.add(session); },
  stopTranslator(session) {
    if (!this.open.delete(session)) return;
    this.translatorMs += Date.now() - session.openedAt;
    this.render();
  },
  render() {
    const openMs = [...this.open].reduce((a, s) => a + (Date.now() - s.openedAt), 0);
    const min = (this.translatorMs + openMs) / 60000;
    const tr = min * TRANSLATE_PER_MIN;
    const elMin = (this.elMs + (this.elSince ? Date.now() - this.elSince : 0)) / 60000;
    const el = elMin * EL_PER_MIN;
    const open = [this.open.size && "translator", this.elSince && "ElevenLabs"].filter(Boolean);
    $("cost").textContent =
      `Spent on this page (estimate): $${(this.agent + tr + el).toFixed(3)}. ` +
      `OpenAI agent $${this.agent.toFixed(3)} · Translator $${tr.toFixed(3)} (${min.toFixed(1)} min)` +
      ` · ElevenLabs $${el.toFixed(3)} (${elMin.toFixed(1)} min)` +
      (open.length ? ` · billing per minute now: ${open.join(", ")}` : "");
    $("cost").classList.toggle("live", open.length > 0);
  },
};
setInterval(() => billing.render(), 1000);
billing.render();

// Close everything when the tab is closed or reloaded, so nothing keeps running on OpenAI's side.
window.addEventListener("pagehide", () => {
  if (active?.conn) {
    try { active.conn.dc.send(JSON.stringify({ type: "session.close" })); } catch { /* closing anyway */ }
    active.conn.close();
  }
  agent?.close();
  elConv?.endSession();
});
