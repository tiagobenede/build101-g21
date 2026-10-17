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

`/talk` es una **llamada en tiempo real** con OpenAI Realtime (WebRTC, full-duplex): hablás cuando querés,
el servidor detecta los turnos (VAD) y si lo interrumpís se calla. La UI no muestra transcripción ni chat:
solo el blob, dónde estás (lugar, hora local, día del viaje, próximo compromiso) y tarjetas de los lugares
que el agente va nombrando (se detectan en su transcripción de audio, en vivo).

Modo ahorro:

| Medida | Por qué ahorra |
|---|---|
| Modelo `gpt-realtime-2.1-mini` | ~3× más barato que `gpt-realtime-2.1` |
| VAD del servidor | Solo se factura la voz detectada, no el silencio |
| Sin transcripción del usuario | Cuesta aparte y la UI no la usa |
| Respuestas de 1–2 oraciones (hasta 4 si pide la historia de algo) + `max_output_tokens: 700` | El audio de salida es lo más caro |
| Contexto en las instrucciones (gustos, 8 lugares, itinerario) | Se cachea entre turnos; sin tools extra |
| Corte a 1 min sin actividad, al salir de la pantalla y a los US$0.30 | Nada queda abierto facturando |
| Pide el mic antes de abrir la sesión | Sin permiso, no se abre nada en OpenAI |

Costo estimado en vivo en el header. Archivos: `src/app/api/realtime/session/route.ts` (key efímera con el
contexto del viajero), `src/lib/realtime/*`, `src/hooks/use-realtime-call.ts`, `src/app/talk/talk-client.tsx`.

> El micrófono no funciona dentro del browser integrado de Claude; probalo en Chrome y con auriculares
> (si no, el agente se puede escuchar a sí mismo).
> El mock de comparación OpenAI vs ElevenLabs está en `docs/realtime-mock/` (`npm run mock`).

### UI generativa (OpenUI)

Mientras Rumbo habla, la pantalla de `/talk` la arma un modelo de texto chico con
[OpenUI](https://www.openui.com/) y nuestros componentes (tarjeta destacada, lista, ruta en el mapa,
comparación, plan con horarios, clima).

- **Un solo agente:** la pantalla muestra exactamente los lugares que devolvió el último tool de lugares del
  agente (`recommend_nearby`, `search_places`, `search_events`, `get_place`), en su orden y en el mismo
  momento en que el resultado entra a la conversación; si no encontró nada, la pantalla se vacía. El modelo
  de UI solo decide cómo mostrarlos, nunca agrega otros. Lo que el viajero toca ("Llevame", "Al plan") se
  le cuenta al agente con un mensaje de sistema. Regla en `src/lib/genui/screen-from-tool.ts`.
- **Cómo:** `POST /api/genui` arma los datos reales (lugares con minutos a pie, itinerario de hoy, clima) y
  devuelve en streaming `DATA:{json}` + OpenUI Lang. El modelo solo compone: los componentes buscan nombre,
  minutos y rating por id, así que no puede inventarlos.
- **Modelo:** `gpt-6-luna` (US$0,10 / 0,50 por millón de tokens) con `reasoning_effort: "none"`.
  Benchmark con 4 pantallas reales y 3 rondas: 12/12 correctas, ~0,9 s a la primera línea, ~1,3 s la
  pantalla completa, ~US$0,0002 por pantalla. `gpt-5.4-mini` es ~250 ms más rápido pero 8x más caro;
  `gpt-4.1-mini` (el anterior) es más lento y 4x más caro; `gpt-5.4-nano` falló 1 de 4.
  `GENUI_MODEL` lo cambia; con `GROQ_API_KEY` usa Groq.
- **Archivos:** `src/lib/genui/library.ts` (esquemas, compartidos server/cliente),
  `src/components/genui/*` (componentes y `<Renderer>`), `src/app/api/genui/route.ts`.
- Las devtools de OpenUI quedan apagadas (`src/lib/genui/no-devtools.ts`): bajan código de un CDN.
- En desarrollo: `window.rumboShow("llevame al Picasso")` en `/talk` prueba una pantalla sin micrófono.

## Base de datos

`supabase/migrations/20261017000000_init.sql` — con RLS (cada usuario ve solo lo suyo):

`profiles` · `interests` · `trips` · `itinerary_items` · `places` · `conversations` · `messages` · `recommendations`

## Deploy

- **App:** Vercel (conectar el repo; cargar las env vars).
- **DB:** Supabase Cloud → `npx supabase link` + `npx supabase db push`. Cambiar `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`.
  Las cuentas demo del seed son solo para local; en cloud crear usuarios desde el dashboard.
