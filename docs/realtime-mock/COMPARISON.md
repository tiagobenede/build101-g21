# OpenAI Realtime vs ElevenLabs Agents: measured comparison

Measured 2026-10-17 with `scripts/benchmark.mjs`: the same 4 prompts (2 English, 2 Spanish),
in one multi-turn session per setup, with the same instructions. Raw data in
`benchmark-results/results-*.json`; listen to each answer in `benchmark-results/*.wav`.

> Input was **text**, so neither setup's speech-to-text time is included. With a real mic,
> add the end-of-speech detection time (both providers: ~0.3–0.8 s depending on settings).

## Latency: time from sending the question to the first audio

| Setup | Turn 1 (en) | Turn 2 (es) | Turn 3 (en) | Turn 4 (es) | **Average** |
|---|---|---|---|---|---|
| OpenAI Realtime (`gpt-realtime-2.1`, voice `marin`) | 1043 ms | 855 ms | 921 ms | 908 ms | **~0.93 s** |
| ElevenLabs + Claude Haiku 5.5 | 1439 ms | 2222 ms | 1819 ms | 1630 ms | **~1.78 s** |
| ElevenLabs + GPT-6 Luna | 1887 ms | 3393 ms | 2177 ms | 1816 ms | **~2.32 s** |

OpenAI is about 2× faster because a single model handles everything; ElevenLabs chains LLM → TTS.

## Cost

| | OpenAI Realtime | ElevenLabs (Luna) | ElevenLabs (Haiku 5.5) |
|---|---|---|---|
| How it's billed | Tokens: audio out $64/1M, audio in $32/1M, text in $4, text out $24, cached $0.40 | **Wall-clock minutes** the session is open ($0.08/min) + LLM tokens | Same |
| This run (4 turns, ~50–55 s of agent speech) | **$0.082** | 202 credits (~$0.04 for 30 s billed) + LLM $0.0007 | 180 credits (~$0.036 for 27 s) + LLM $0.0009 |
| Per minute of the agent **speaking** | ~$0.077 audio out (≈1,200 audio tokens/min) + a little text | $0.08 | $0.08 |
| Per minute of **silence** (session open, nobody talking) | ~$0 (only audio that turn detection sends to the model is billed) | **$0.08** | **$0.08** |
| LLM share | included | ~$0.001/min | ~$0.002/min |

The ElevenLabs runs were billed for less time than the speech they produced because the benchmark
doesn't wait for playback; in a real call the session lasts at least as long as the audio plays.

### Example: a realistic 5-minute travel session
2 min agent talking, 1 min user talking, 2 min of walking/looking around with the session open.

| | Estimate |
|---|---|
| OpenAI Realtime | 2 × $0.077 (out) + 1 × ~$0.02 (user audio in) + re-read context (mostly cached) ≈ **$0.18–0.25** |
| ElevenLabs | 5 × $0.08 + LLM ≈ **$0.40** |

**Takeaway:** while people are talking, the two cost about the same. ElevenLabs bills idle time too,
so for an assistant that stays open while you walk, either close the session when idle or OpenAI ends
up cheaper. OpenAI's cost climbs instead with long conversations (history re-read each turn); caching softens that.

## Answer quality (same prompts)

| | Notes |
|---|---|
| OpenAI | Concise and specific; answered in Spanish when asked in Spanish. |
| ElevenLabs + Haiku 5.5 | Warm and natural; asks follow-up questions ("art, food, or history?"). Writes ElevenLabs v4 emotion tags (`[happy]`, `[excited]`) that the voice acts out. Remove them from the prompt if you don't want them. |
| ElevenLabs + Luna | Correct but adds disclaimers ("check opening hours before you go") in almost every answer. Slowest. |

All three got the language switching right and named real places (Casa Labra, Mercado de San Miguel, Museo Picasso).

## Features for the travel assistant

| | OpenAI Realtime | ElevenLabs Agents |
|---|---|---|
| Camera / "what am I seeing" | `input_image` in the same session | Image upload to a vision-capable LLM (not live video) |
| GPS | Tool call → browser runs `navigator.geolocation` | Client tool (same idea) or a dynamic variable at session start |
| Tools | Function calling, defined in code | Client tools, webhook tools, code tools, configured in dashboard/API |
| MCP | Supported (remote servers) | Remote SSE/HTTP with per-tool approvals |
| Spanish voices | `marin`/`cedar`, good but no accent choice | Thousands of voices, regional accents, cloning |
| Translator | `gpt-realtime-translate` ($0.034/min), already working | None dedicated; keep OpenAI's |
| Config lives in | Your code | ElevenLabs dashboard (or API) |

## Recommendation
- **Default: OpenAI Realtime** for the assistant. It's ~2× lower latency, costs about the same while talking and less when idle, and handles images natively.
- **ElevenLabs + Haiku 5.5** if voice quality and Spanish accents matter most, or for dashboard-configured tools/MCP. Avoid Luna: it's slower and less natural here.
- Keep **`gpt-realtime-translate`** for face-to-face translation in either case.

## API keys
| Key | Needed for |
|---|---|
| `OPENAI_API_KEY` | OpenAI assistant + translator |
| `ELEVENLABS_API_KEY` | ElevenLabs agents (the LLM is billed through ElevenLabs; no separate OpenAI/Anthropic key) |
| `ELEVENLABS_AGENT_LUNA`, `ELEVENLABS_AGENT_HAIKU` | Agent IDs, created by `scripts/elevenlabs-setup.mjs` |
| `GOOGLE_MAPS_API_KEY` | Later, for the places tool |

## Reproduce
```bash
node --env-file=.env docs/realtime-mock/scripts/elevenlabs-setup.mjs   # once
node --env-file=.env docs/realtime-mock/scripts/benchmark.mjs          # all, or: openai | luna | haiku
```
A full run costs about $0.15.
