// Minimal backend: serves the test page and mints short-lived OpenAI keys
// so the real API key never reaches the browser.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { INSTRUCTIONS } from "./shared.mjs";

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2.1";
const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL || "gpt-realtime-translate";
const VOICE = process.env.VOICE || "marin";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

async function mintSecret(url, session) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  });
  const data = await res.json().catch(() => ({}));
  // Endpoints return the key as `value`; older shapes nest it under client_secret.
  const value = data.value ?? data.client_secret?.value;
  return { status: res.status, ok: res.ok && !!value, value, data };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      if (!OPENAI_API_KEY) {
        return sendJson(res, 500, { error: "OPENAI_API_KEY is not set. Add it to .env and restart." });
      }

      if (url.pathname === "/api/session") {
        const r = await mintSecret("https://api.openai.com/v1/realtime/client_secrets", {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: INSTRUCTIONS,
          audio: { output: { voice: VOICE } },
        });
        if (!r.ok) return sendJson(res, r.status || 500, { error: "OpenAI refused session", details: r.data });
        return sendJson(res, 200, { value: r.value, model: REALTIME_MODEL });
      }

      if (url.pathname === "/api/translate-session") {
        const language = url.searchParams.get("lang") || "es";
        const r = await mintSecret("https://api.openai.com/v1/realtime/translations/client_secrets", {
          model: TRANSLATE_MODEL,
          audio: { output: { language } },
        });
        if (!r.ok) return sendJson(res, r.status || 500, { error: "OpenAI refused translation session", details: r.data });
        return sendJson(res, 200, { value: r.value, model: TRANSLATE_MODEL, language });
      }

      if (url.pathname === "/api/elevenlabs-token") {
        // ?agent=luna|haiku → WebRTC conversation token for that private ElevenLabs agent
        const agentId = process.env[`ELEVENLABS_AGENT_${(url.searchParams.get("agent") || "luna").toUpperCase()}`];
        if (!process.env.ELEVENLABS_API_KEY || !agentId) {
          return sendJson(res, 500, { error: "Set ELEVENLABS_API_KEY and run scripts/elevenlabs-setup.mjs first." });
        }
        const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`, {
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.token) return sendJson(res, r.status || 500, { error: "ElevenLabs refused token", details: data });
        return sendJson(res, 200, { token: data.token, agentId });
      }

      return sendJson(res, 404, { error: "Unknown endpoint" });
    }

    if (req.method === "GET") {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      if (path.includes("..")) return sendJson(res, 400, { error: "Bad path" });
      const file = await readFile(join(import.meta.dirname, "public", path)).catch(() => null);
      if (!file) return sendJson(res, 404, { error: "Not found" });
      res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
      return res.end(file);
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Travel agent test server on http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) console.warn("Warning: OPENAI_API_KEY is not set (add it to .env)");
});
