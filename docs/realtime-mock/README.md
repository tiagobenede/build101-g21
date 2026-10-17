# Realtime mock: voice agent + translator

A minimal, working reference for the travel assistant. Use it as a mock and
as an example of how to connect to the OpenAI Realtime API. No dependencies:
a Node server plus a vanilla WebRTC page.

## How to run

1. Put `OPENAI_API_KEY=...` in `.env` at the **project root** (see `.env.example`).
2. `npm run mock` (from the root).
3. Open `http://localhost:3000` in **Chrome** (the app's built-in browser blocks the mic). Use headphones for the translator.

## What it includes

| File | What it does |
|---|---|
| `server.mjs` | Serves the page and mints short-lived keys (`ek_…`) so the real API key never reaches the browser. |
| `public/app.js` | WebRTC straight to OpenAI: agent and translator. |
| `public/index.html` | Test UI. |

| `shared.mjs` | Agent instructions shared by the server and scripts. |
| `scripts/elevenlabs-setup.mjs` | Creates the ElevenLabs comparison agents (GPT-6 Luna, Claude Haiku 5.5) and writes their IDs to `.env`. |
| `scripts/benchmark.mjs` | Same prompts against OpenAI and both ElevenLabs agents: latency, cost and WAV audio. Results in [COMPARISON.md](COMPARISON.md). |

### Server endpoints
- `POST /api/elevenlabs-token?agent=luna|haiku` → WebRTC conversation token for the private ElevenLabs agent (section 1b of the page).
- `POST /api/session` → key for `gpt-realtime-2.1` (voice `marin`, travel-assistant instructions, replies in the user's language).
- `POST /api/translate-session?lang=es` → key for `gpt-realtime-translate` with the target language.

### OpenAI flow (verified 2026-10-17)
- **Agent:** `POST https://api.openai.com/v1/realtime/client_secrets` with `{ session: { type: "realtime", model, instructions, audio: { output: { voice } } } }` → `value`. Browser: SDP to `https://api.openai.com/v1/realtime/calls`, data channel `oai-events`.
- **Translator:** `POST https://api.openai.com/v1/realtime/translations/client_secrets` with `{ session: { model: "gpt-realtime-translate", audio: { output: { language } } } }` → `value`. Browser: SDP to `https://api.openai.com/v1/realtime/translations/calls`. Translates continuously, without `response.create`.
- Useful events: `response.output_audio_transcript.delta` (agent), `session.output_transcript.delta` (translator), `error`.

### Face-to-face translator
Two sessions, one per direction (me → their language, them → my language).
They share the mic; the "I'm speaking" / "They're speaking" buttons turn on only
the active direction's track.

## Verified results
- Keys mint correctly for both models.
- Agent: connects and answers with voice ("Start with the Prado Museum…").
- Translator: English speech → Spanish audio and text ("Prueba Tomo Café, que está a un corto paseo…").
- Proper names get garbled ("La Mallorquina" → "La Maloyoschina"); test them before the demo.
- `session.input_transcript.delta` didn't arrive on WebRTC (only the output transcript did).
- Not tested yet: the real mic (Browser pane limitation).

## Gotchas
- Chrome doesn't forward a remote audio track straight into another `RTCPeerConnection` (it sends silence). Pass it through Web Audio (`createMediaStreamSource` → `createMediaStreamDestination`).
- On a phone, camera and mic need HTTPS (deploy or use ngrok).
- Restart the server after changing `.env`.

## Provider research (summary)
- **OpenAI Realtime** (chosen): native speech-to-speech, low latency, tools, image input, Agents SDK (`@openai/agents/realtime`). ~$0.06–0.11/min (third-party estimate). Recommended voices: `marin`, `cedar`. Speaks Spanish, but you can't pick a regional accent.
- **ElevenLabs Agents**: STT → LLM of your choice → TTS. 5k+ voices with regional Spanish accents, automatic language detection, Twilio/SIP. ~$0.08/min + LLM. A good fit later if voice quality matters.
- **Translation**: `gpt-realtime-translate` ($0.034/min, used here); DeepL Voice API (text, voice-to-voice in early access); Azure Live Interpreter (preview, automatic language detection); Soniox (streaming captions); Google Gemini S2ST (experimental).

## Next steps
- Places-search tool (geolocation + Google Places/Foursquare).
- Send camera frames as `input_image`.
- Move to the Agents SDK when tools are added.
