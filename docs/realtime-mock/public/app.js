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

let agent = null;
let agentMic = null;

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
    $("agentStop").disabled = false;
    $("agentMute").disabled = false;
  } catch (err) {
    setStatus(status, "Failed", "err");
    logLine(log, String(err.message ?? err), "err");
    stopAgent();
  }
};

function stopAgent() {
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

let elConv = null;

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
      onConnect: () => setStatus(status, "Connected. Say hi!", "ok"),
      onDisconnect: () => setStatus(status, "Disconnected"),
      onModeChange: ({ mode }) => setStatus(status, mode === "speaking" ? "Speaking…" : "Listening…", "ok"),
      onMessage: ({ source, message }) => logLine(log, `${source === "user" ? "You" : "Agent"}: ${message}`, source === "user" ? "you" : ""),
      onError: (msg) => logLine(log, `Error: ${msg}`, "err"),
    });
    $("elStop").disabled = false;
  } catch (err) {
    setStatus(status, "Failed", "err");
    logLine(log, String(err.message ?? err), "err");
    $("elStart").disabled = false;
  }
};

$("elStop").onclick = async () => {
  await elConv?.endSession();
  elConv = null;
  $("elStart").disabled = false;
  $("elStop").disabled = true;
  setStatus($("elStatus"), "Stopped");
};

// ---------- 2. Face-to-face translator ----------
// Direction "me":   my speech   -> their language
// Direction "them": their speech -> my language
// Both sessions share the mic; only the active direction's track is enabled.

let trMic = null;
const dirs = {}; // { me: {conn, track}, them: {conn, track} }

async function openDirection(name, targetLang, label) {
  const track = trMic.getAudioTracks()[0].clone();
  track.enabled = false;
  const key = await getKey(`/api/translate-session?lang=${targetLang}`);
  let line = null;
  const conn = await connect({
    key,
    callsUrl: "https://api.openai.com/v1/realtime/translations/calls",
    track,
    onEvent(ev) {
      if (!ev.type.endsWith(".delta")) logLine($("trEvents"), `[${name}] ${ev.type}`, "sys");
      if (ev.type === "session.output_transcript.delta") {
        line ??= logLine($("trLog"), `${label} → ${LANGS[targetLang]}: `, name === "me" ? "you" : "");
        line.textContent += ev.delta;
        clearTimeout(line._t);
        line._t = setTimeout(() => { line = null; }, 1500); // start a new line after a pause
      } else if (ev.type === "error") {
        logLine($("trLog"), `[${name}] Error: ${ev.error?.message ?? JSON.stringify(ev)}`, "err");
      }
    },
  });
  dirs[name] = { conn, track };
}

function setSpeaker(name) {
  for (const [n, d] of Object.entries(dirs)) d.track.enabled = n === name;
  $("speakMe").classList.toggle("active", name === "me");
  $("speakThem").classList.toggle("active", name === "them");
  setStatus($("trStatus"), name ? `Translating ${name === "me" ? "you" : "them"}…` : "Ready. Pick who is speaking.", "ok");
}

$("trStart").onclick = async () => {
  const myLang = $("myLang").value, theirLang = $("theirLang").value;
  $("trStart").disabled = true;
  try {
    setStatus($("trStatus"), "Getting mic…");
    trMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    setStatus($("trStatus"), "Connecting both directions…");
    await Promise.all([
      openDirection("me", theirLang, "Me"),
      openDirection("them", myLang, "Them"),
    ]);
    $("trStop").disabled = false;
    $("speakMe").disabled = false;
    $("speakThem").disabled = false;
    setSpeaker(null);
  } catch (err) {
    setStatus($("trStatus"), "Failed", "err");
    logLine($("trLog"), String(err.message ?? err), "err");
    stopTranslator();
  }
};

function stopTranslator() {
  for (const d of Object.values(dirs)) { d.conn.close(); d.track.stop(); }
  for (const k of Object.keys(dirs)) delete dirs[k];
  trMic?.getTracks().forEach((t) => t.stop());
  trMic = null;
  $("trStart").disabled = false;
  $("trStop").disabled = true;
  $("speakMe").disabled = true;
  $("speakThem").disabled = true;
  $("speakMe").classList.remove("active");
  $("speakThem").classList.remove("active");
}

$("trStop").onclick = () => { stopTranslator(); setStatus($("trStatus"), "Stopped"); };

// Hold to talk, or tap to toggle.
for (const [btn, name] of [[$("speakMe"), "me"], [$("speakThem"), "them"]]) {
  let downAt = 0, wasActive = false;
  btn.addEventListener("pointerdown", () => {
    downAt = Date.now();
    wasActive = !!dirs[name]?.track.enabled;
    setSpeaker(name);
  });
  btn.addEventListener("pointerup", () => {
    const held = Date.now() - downAt > 400;
    if (held || wasActive) setSpeaker(null); // released after holding, or tapped again: stop
  });
}
