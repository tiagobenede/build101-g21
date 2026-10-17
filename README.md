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

### La voz hoy (simulada) y mañana (real)

`src/hooks/use-voice-session.ts` expone `state` (`idle | listening | thinking | talking`), volúmenes de entrada/salida
y el transcript. Hoy lo implementa con APIs del navegador:

- **Micrófono** → volumen real con Web Audio (`use-mic-volume.ts`).
- **Dictado** → Web Speech API, `es-ES` (Chrome/Edge/Safari) (`use-speech-recognition.ts`).
- **Cerebro** → server action `sendMessage` → `src/lib/agent/recommend.ts` (reglas: gustos × distancia × tiempo libre
  × próximo compromiso del itinerario). Guarda mensajes y recomendaciones en la DB.
- **Voz** → `speechSynthesis` del navegador (`use-speech-synthesis.ts`). Con el botón de silencio, solo texto.

Para pasar a **ElevenLabs Agents + Claude**: reemplazar el hook por `useConversation` de `@elevenlabs/react`
(`VoiceOrb` solo necesita refs de volumen de entrada/salida, que el SDK expone) y exponer `get_nearby_places` / `get_traveler_context`
como tools que lean la misma DB.

## Base de datos

`supabase/migrations/20261017000000_init.sql` — con RLS (cada usuario ve solo lo suyo):

`profiles` · `interests` · `trips` · `itinerary_items` · `places` · `conversations` · `messages` · `recommendations`

## Deploy

- **App:** Vercel (conectar el repo; cargar las env vars).
- **DB:** Supabase Cloud → `npx supabase link` + `npx supabase db push`. Cambiar `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`.
  Las cuentas demo del seed son solo para local; en cloud crear usuarios desde el dashboard.
