# Rumbo — guía de viaje por voz

Asistente de viaje con voz que conoce tus gustos, tu ubicación, los lugares cercanos y tu itinerario.
MVP de hackathon: **Next.js 16 + shadcn/ui + Supabase (Postgres local)**. UI clara, estilo Apple.

## Cómo levantarlo

Requisitos: Node 20.9+, Docker Desktop corriendo.

```bash
npm install
cp .env.example .env.local
npx supabase start      # Postgres + Auth locales en Docker (la 1ª vez descarga imágenes)
npm run dev             # http://localhost:3000
```

Entrás con una de las 3 **cuentas demo** (Sofía: autos y diseño, Mateo: arte e historia, Lucía: comida y mercados).
Todas están en París, cerca del Centre Pompidou, con itinerario para hoy.

Otros comandos útiles:

| Comando | Qué hace |
|---|---|
| `npx supabase db reset` | Recrea la DB desde `supabase/migrations` + `supabase/seed.sql` |
| `npx supabase status` | Muestra URLs y keys locales |
| Studio: http://127.0.0.1:54323 | UI para ver tablas y datos |
| `npx vitest run` | Tests del motor de recomendaciones |
| `npx supabase stop` | Apaga los contenedores |

> **iCloud:** si la carpeta está en Desktop/Documents con "Optimizar almacenamiento", iCloud puede vaciar archivos de
> `node_modules` y todo se cuelga. Excluí las carpetas de sync:
> `xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules .next`

## Qué hay

- **`/login`** — selector de cuentas demo (lista agrupada estilo iOS).
- **`/`** — home: ubicación, día del viaje, gustos, itinerario de hoy y lugares cercanos ("Para vos").
- **`/talk`** — pantalla de voz: blob (canvas 2D) que se deforma con el micrófono y con la voz del agente,
  transcripción que se va revelando, tarjetas de recomendación con minutos caminando y de visita.

### Voz

La pantalla usa `VoiceSession` (`src/hooks/voice-session-types.ts`) con dos implementaciones, elegidas con `VOICE_PROVIDER`:

**`openai` — voz real con OpenAI Realtime (por defecto si hay `OPENAI_API_KEY`), en modo ahorro:**

| Medida | Por qué ahorra |
|---|---|
| Modelo `gpt-realtime-2.1-mini` | ~3× más barato que `gpt-realtime-2.1` |
| Push-to-talk (sin VAD) | Solo se factura el audio entre que tocás y soltás el mic, no el silencio |
| Sin transcripción de OpenAI | Tu texto lo transcribe gratis el navegador (Web Speech) |
| Respuestas de 1–2 oraciones + `max_output_tokens: 500` | El audio de salida es lo más caro |
| Contexto en las instrucciones (gustos, 8 lugares, itinerario) | Se cachea entre turnos; sin tools extra |
| Sesión lazy, cierre a los 45 s inactiva, al salir y a los US$0.30 | Nada queda abierto facturando |
| Medidor de costo en el header | Estimado desde `response.usage` |

Medido: **~US$0.002 por turno** de texto con respuesta hablada. Archivos: `src/app/api/realtime/session/route.ts`
(acuña la key efímera con el contexto del viajero), `src/lib/realtime/*`, `src/hooks/use-realtime-session.ts`.

**`browser` — simulada, gratis:** mic + dictado + `speechSynthesis` del navegador y el motor de reglas
`src/lib/agent/recommend.ts`. Útil para desarrollar la UI sin gastar.

> El micrófono no funciona dentro del browser integrado de Claude; probalo en Chrome.
> El mock de comparación OpenAI vs ElevenLabs está en `docs/realtime-mock/` (`npm run mock`).

## Base de datos

`supabase/migrations/20261017000000_init.sql` — con RLS (cada usuario ve solo lo suyo):

`profiles` · `interests` · `trips` · `itinerary_items` · `places` · `conversations` · `messages` · `recommendations`

## Deploy

- **App:** Vercel (conectar el repo; cargar las env vars).
- **DB:** Supabase Cloud → `npx supabase link` + `npx supabase db push`. Cambiar `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`.
  Las cuentas demo del seed son solo para local; en cloud crear usuarios desde el dashboard.
