// Creates the ElevenLabs test agents (one per LLM) and appends their IDs to .env.
// Run from the project root: node --env-file=.env docs/realtime-mock/scripts/elevenlabs-setup.mjs
import { appendFile } from "node:fs/promises";
import { INSTRUCTIONS } from "../shared.mjs";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY is not set");

const AGENTS = [
  { env: "ELEVENLABS_AGENT_LUNA", name: "Travel agent test (gpt-6-luna)", llm: "gpt-6-luna" },
  { env: "ELEVENLABS_AGENT_HAIKU", name: "Travel agent test (claude-haiku-5-5)", llm: "claude-haiku-5-5" },
];

for (const a of AGENTS) {
  if (process.env[a.env]) {
    console.log(`${a.env} already set, skipping`);
    continue;
  }
  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: a.name,
      conversation_config: {
        agent: {
          first_message: "",
          language: "en",
          prompt: { prompt: INSTRUCTIONS, llm: a.llm },
        },
        tts: { model_id: "eleven_v4_turbo" },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${a.llm}: ${res.status} ${JSON.stringify(data)}`);
  await appendFile(".env", `\n${a.env}=${data.agent_id}`);
  console.log(`${a.env}=${data.agent_id}`);
}
