# Planning — Rumbo

Hackathon · 3 desarrolladores. Este documento es la fuente de verdad del plan: qué construimos, en qué orden y quién lo hace. Cada tarea tiene un ID (`F0-x`, `A-x`, `B-x`, `C-x`) para convertirla en issue.

> **Antes de escribir código:** este repo usa **Next.js 16 con cambios incompatibles**. Leer la guía correspondiente en `node_modules/next/dist/docs/` (ver `AGENTS.md`). No escribir Next "de memoria".

---

## 1. Producto

Rumbo es un guía de viaje por voz. Conoce tus gustos y restricciones, lee y modifica tu itinerario, te recomienda qué hacer según dónde estás y el tiempo que tenés, identifica lo que ves con la cámara, traduce tus charlas con residentes y guarda lo que te recomiendan. Además te avisa por su cuenta cuando pasás cerca de algo que te interesa.

**El diferencial:** la traducción alimenta la memoria. Lo que un residente te recomienda en francés queda guardado, anclado a un lugar del mapa, puede sumarse al plan y dispara un aviso cuando pasás cerca:

> "Estás a 2 minutos de la crêperie que te recomendó Camille esta mañana."

---

## 2. Lo que ya existe (no rehacer)

| Área | Estado | Dónde |
|---|---|---|
| App | Next.js 16 + shadcn/ui, UI estilo iOS, `src/` | `src/app`, `src/components/rumbo`, `src/components/ui` |
| Login | 3 cuentas demo en París: **Sofía** (autos, diseño, café), **Mateo** (arte, historia, libros), **Lucía** (comida, mercados, parques) | `src/app/login`, `src/lib/demo-accounts.ts`, `supabase/seed.sql` |
| Base de datos | Supabase local en Docker, permisos por usuario en todas las tablas: `profiles`, `interests`, `trips`, `itinerary_items`, `places`, `conversations`, `messages`, `recommendations` | `supabase/migrations/20261017000000_init.sql` |
| Lugares | **Google Places (New)**: Nearby Search alrededor de la ubicación (comida y lugares para ver), traducidos a categoría, tags de gustos y minutos de visita, y guardados en `places` como cache (máximo 2 llamadas por celda de ~1 km cada 24 h). Ya no hay lugares en el seed. Necesita `GOOGLE_API_KEY` y `SUPABASE_SECRET_KEY` | `src/lib/places/*`, `src/lib/supabase/admin.ts` |
| Home | Ubicación, día del viaje, gustos, itinerario de hoy y "Para vos" (lugares cercanos que coinciden con los gustos) | `src/app/page.tsx` |
| Contexto del viajero | `getTravelerContext()`: perfil, gustos, viaje activo, itinerario y lugares cercanos con distancia y minutos a pie | `src/lib/data/session.ts` |
| Geo | Distancia haversine, minutos caminando (factor 1,3 por calles) | `src/lib/geo.ts` |
| Ranking de lugares | Gustos × distancia × tiempo libre × próximo compromiso, máximo 3 resultados. Con tests | `src/lib/agent/rank.ts` |
| **Voz real** | OpenAI Realtime por WebRTC, **llamada full-duplex**: `gpt-realtime-2.1-mini`, `server_vad` con `interrupt_response` (hablás cuando querés y lo interrumpís hablando), sin transcripción del usuario, pide el mic antes de abrir la sesión, máximo 500 tokens de salida, el contexto va en las instrucciones al abrir la sesión, corta a los 60 s sin actividad, al ocultar la página o al llegar a US$0,30. Medidor de costo en vivo | `src/app/api/realtime/session/route.ts`, `src/lib/realtime/*`, `src/hooks/use-realtime-call.ts` |
| **Tools del agente** | Registro de tools con zod, `recommend_nearby`, route handler que los ejecuta y **cola de respuestas** para que corran en segundo plano sin chocar con las respuestas del VAD. Con tests | `src/lib/realtime/tools.ts`, `src/lib/realtime/response-queue.ts`, `src/lib/agent/run-tool.ts`, `src/app/api/realtime/tools/route.ts` |
| Pantalla de voz | `/talk`: **sin chat ni transcripción**. Blob al centro que reacciona a tu voz y a la del agente, tarjeta de dónde estás (lugar, hora local, día del viaje, próximo compromiso) y **notificaciones estilo iOS** de los lugares que recomienda el agente (el primero del resultado del tool; los demás si los nombra, detectados en su transcripción de audio), apiladas con scroll y fade | `src/app/talk`, `src/components/rumbo/place-notification.tsx`, `scroll-fade.tsx` |
| Voz simulada | **Eliminada.** Se trabaja siempre con la llamada real (es barata) | — |
| Traductor (en el mock) | `gpt-realtime-translate` funcionando, una sesión por dirección, cierre automático | `docs/realtime-mock/public/app.js`, `docs/realtime-mock/server.mjs` |
| Comparación de proveedores | OpenAI Realtime elegido frente a ElevenLabs por latencia y costo | `docs/realtime-mock/COMPARISON.md` |

### Principios que respetamos

1. **Bajo costo primero.** Es una decisión del equipo: modelo `mini`, respuestas cortas, solo se factura la voz que detecta el VAD, la llamada se corta sola (60 s sin actividad, al salir o a los US$0,30). Ninguna feature nueva deja sesiones abiertas sin necesidad ni agrega llamadas a modelos donde una regla alcanza.
2. **El contexto va en las instrucciones, no en tools.** Así se cachea entre turnos. Con la llamada full-duplex las sesiones duran más, así que el contexto se desactualiza: `session.update` cuando cambia algo grande (te moviste más de 300 m, cambió el itinerario, entró un evento del calendario). Los tools traen lo que no entra en el contexto.
3. **Seguimos con la conexión WebRTC propia.** No migramos al Agents SDK: los tools se agregan sobre `src/lib/realtime/connection.ts` y `use-realtime-call.ts`.
4. **Los tools corren en el server con el login del usuario.** Pasan por el route handler `/api/realtime/tools`, que respeta el login y los permisos por usuario. **No son server actions** porque Next las despacha de a una por cliente: un tool lento (Google, el planner) bloquearía a los demás y a `saveTurn` mientras seguimos hablando. La lógica vive en funciones compartidas que también usa la UI.
5. **Ninguna fuente externa por MCP dentro de la sesión.** Google Places, eventos y calendario entran como tools propios: así se recortan los resultados a 3, se guardan en `places` y se filtran las restricciones en el server.
6. **Un solo camino de código por operación.** Las funciones de itinerario las usan la UI y los tools por igual.
7. **El lugar es la entidad que conecta todo.** Recomendaciones del agente, recomendaciones de residentes, itinerario y avisos apuntan a una fila de `places`.
8. **`/talk` es una llamada, no un chat.** Nunca se muestra la transcripción. Lo único que aparece en pantalla además del blob es información útil: dónde estás y lo que el agente te va recomendando.

---

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Ciudad | **París**, alrededor del Pompidou y el Marais |
| Cuenta de la demo | **Lucía** (comida, mercados, parques): es la que mejor encaja con "un residente te recomienda un lugar" |
| Dónde se muestra | **Desde la laptop en `localhost`.** El micrófono funciona en localhost, el GPS es simulado y la cámara es la webcam o una foto subida. Deploy a la nube (Vercel + Supabase Cloud, o ngrok para HTTPS) **solo si sobra tiempo** |
| Residente en la demo | Alguien del equipo que hable **francés** (definir quién en F0) |
| Lugares | **Todos de Google Places (New)**, sin seed. Los cercanos se cargan solos en `places`; el tool `search_places` (Text Search) busca lo que no aparece cerca. Un solo módulo de Google (`src/lib/places`) compartido entre A (tools) y C (C-5) |
| Eventos | Tool `search_events` con un **proveedor intercambiable**. Para la demo: la API de datos abiertos "Que faire à Paris" (gratis, sin key). Más un evento en el seed para no depender de lo que publique ese día |
| Clima | Open-Meteo (gratis, sin key), **en las instrucciones**, no como tool |
| Calendario | Google Calendar con `calendar.events`. Se porta el cliente OAuth de `~/git/adven` (FastAPI) a TypeScript, con un **client OAuth nuevo "Rumbo"** (no el de Adven) y una cuenta de Google "Lucía" con eventos de la demo. Los eventos entran como actividades `locked` con `source = 'calendar'`. Sin webhooks: se lee al abrir la sesión |
| Traducción | **`gpt-realtime-translate`**, portado desde el mock. No una sesión del guía en modo intérprete |
| Visión | Una llamada aparte del server a un modelo de visión barato, no imágenes dentro de la sesión de voz. El resultado entra a la sesión como texto |

---

## 4. Cambios en la base de datos

**Una migración nueva** (`supabase/migrations/<fecha>_rumbo_features.sql`). No se edita `init.sql`. Todas las tablas nuevas llevan permisos por usuario igual que las existentes.

### Tablas existentes que se extienden

```sql
-- profiles: restricciones, ritmo y perfil compilado
alter table public.profiles
  add column dietary         text[] not null default '{}',  -- 'vegetariano', 'celíaco', ...
  add column mobility        text,                           -- 'sin escaleras', ...
  add column daily_budget    int,                            -- euros por día
  add column pace            text,                           -- 'tranquilo' | 'intenso'
  add column schedule        text,                           -- 'madrugador' | 'noctámbulo'
  add column compiled_summary text;                          -- párrafo que va a las instrucciones

-- itinerary_items: estado, origen y reservas
alter table public.itinerary_items
  add column status     text not null default 'planned'
             check (status in ('planned','in_progress','done','skipped')),
  add column source     text not null default 'user'
             check (source in ('user','agent','local_tip','event','calendar')),
  add column calendar_event_id text,          -- id del evento de Google Calendar
  add column source_ref uuid,                 -- id del local_tip que lo originó
  add column locked     boolean not null default false;  -- reserva: el planner no la mueve
-- place_id ya existe (text, sin FK): apunta a places.id

-- places: lugares que existen pero no se ofrecen como "cercanos"
alter table public.places
  add column listed boolean not null default true;
-- opening_hours, google_place_id y demás datos van en places.data (jsonb)

-- conversations: guía o traducción
alter table public.conversations
  add column kind      text not null default 'guide' check (kind in ('guide','translation')),
  add column lang_pair text;                  -- 'es-fr'

-- messages: rol del residente e idioma
-- ampliar el check de role a ('user','agent','local')
alter table public.messages
  add column lang            text,
  add column translated_text text;
```

`recommendations` **ya se usa para lo que sugiere el agente** y no se toca.

### Tablas nuevas

```sql
local_tips (                       -- lo que recomiendan los residentes
  id, user_id, trip_id, conversation_id,
  place_id text null → places,     -- null si no se pudo anclar a un lugar
  place_name_raw, what, why, when_to_go, price_hint,
  recommender text,                -- "Camille, la de la panadería"
  original_quote, original_lang, translated_quote,
  status text,                     -- 'pending' | 'saved' | 'in_plan' | 'dismissed'
  confidence real, created_at
)

profile_facts (                    -- lo que el agente aprende hablando
  id, user_id, kind text,          -- 'constraint' | 'preference'
  statement text,                  -- "Evita museos largos, más de una hora"
  polarity int, source text,       -- 'stated' | 'inferred'
  evidence text, superseded_by uuid null, created_at
)

pings (id, user_id, lat, lng, heading, source text /* 'mock' | 'real' */, created_at)

notifications (id, user_id, place_id, reason_text, candidate_type, created_at, seen_at)

itinerary_snapshots (id, trip_id, items jsonb, created_at)  -- para "volvé al plan anterior"

google_accounts (user_id pk, email, refresh_token, scope, updated_at)  -- solo lo lee el server
```

Activar Supabase Realtime en `itinerary_items`, `local_tips`, `notifications` y `recommendations`.

### Seed

- Los lugares ya no van en el seed (vienen de Google). El que recomienda el residente en la demo (la crêperie del Marais) se resuelve con Text Search en C-5; para que el agente no lo sugiera antes, marcarlo `listed = false` al guardarlo.
- Una ruta de caminata para la demo que pase cerca de ese lugar.
- Restricciones y ritmo para las 3 cuentas.

---

## 5. Contexto del agente

`buildInstructions()` en `src/lib/realtime/instructions.ts` ya arma el contexto con el nombre, los gustos, el estilo, la ubicación, la hora, el próximo compromiso y 8 lugares cercanos. Se extiende con:

- **Restricciones** marcadas como no negociables (dieta, movilidad, presupuesto).
- **Perfil compilado** (`profiles.compiled_summary`), con lo aprendido en `profile_facts`.
- **Itinerario de hoy completo** con estado (hecho, saltado, pendiente), no solo el próximo compromiso.
- **Recomendaciones de residentes** guardadas, con quién las dio y a cuántos minutos están.
- **Ubicación real del GPS simulado**: el último ping, no el centro del viaje.

Hay que cuidar el presupuesto de tokens: lo que entra en las instrucciones se lee en cada turno. Ya existe `MAX_PLACES_IN_CONTEXT` en `src/lib/realtime/config.ts`; hacer lo mismo con las demás listas.

### Ubicación

Hoy `getTravelerContext()` usa **el centro del destino como ubicación fija**, y "Centre Pompidou" está escrito a mano en `locationLabel`. Se cambia a:
- `location` = último registro de `pings` del usuario, con el centro del viaje como respaldo.
- `locationLabel` = nombre del lugar de `places` más cercano a menos de ~300 m ("Place des Vosges"), **sin "cerca de"**: `/talk` y la home ya le ponen el texto alrededor. Si no hay ninguno, el nombre del destino.

---

## 6. Tools del agente

**Cómo funciona (ya hecho en A-1):**
- Cada tool es una entrada en `src/lib/realtime/tools.ts` (esquema zod + descripción). De ahí salen las definiciones que se mandan en `/api/realtime/session` y la validación en el server.
- `use-realtime-call.ts` arranca el tool en `response.function_call_arguments.done`, sin esperar el `response.done`, y llama a `/api/realtime/tools`.
- `ResponseQueue` decide cuándo entra el resultado: manda el `function_call_output` cuando terminó la respuesta que pidió el tool (si el usuario la interrumpió, se descarta) y pide `response.create` solo si no hay una respuesta activa, nadie habla y no queda otro tool pendiente. Así **el tool corre en segundo plano y la charla sigue**.
- Mientras hay un tool pendiente, la llamada no se corta por inactividad.
- Para agregar un tool: una entrada en `toolSchemas` + un caso en `runTool` (`src/lib/agent/run-tool.ts`).

**Tareas largas** (Google, `plan_day`): el tool responde al instante "lo estoy buscando" y el resultado entra después con `conversation.item.create` a través de la cola, para que el agente lo cuente cuando corresponde (A-1b).

```
recommend_nearby(available_minutes: number|null, interest: tag|null)   ✅ hecho
                                         → usa rank.ts; devuelve hasta 3 lugares
get_place(place_id: string)              → descripción, horarios, minutos a pie
search_places(query: string, open_now: boolean|null)   ✅ hecho
                                         → Google Places; guarda en places; hasta 3
search_events(when: 'now'|'today'|'tomorrow', kind: tipo|null, free_only: boolean|null)   ✅ hecho
                                         → Que faire à Paris; guarda en places; hasta 3
edit_itinerary(op: 'add'|'move'|'remove'|'done'|'skip'|'undo',
               item_id: string|null, place_id: string|null, title: string|null,
               starts_at: string|null, ends_at: string|null)
remember(statement: string, kind: 'constraint'|'preference')
add_to_calendar(item_id: string|null)    → null = todo el plan de hoy
plan_day(date: string, brief: string)    → prioridad media, asíncrono
```

Con 8 tools y descripciones cortas son ~1.000 tokens por turno, cacheados (~US$0,0001 por turno). No agregar más sin sacar otro.

Reglas:
- **zod 4: usar `.nullable()` y nunca `.optional()`** en los parámetros. El modo strict exige que todas las propiedades estén en `required`; si no, el tool falla en silencio.
- **Las restricciones se filtran en el server**, no en el prompt.
- **Respuestas cortas:** como máximo 3 resultados y pocos campos. Todo lo que devuelve un tool se lee como tokens de entrada.
- **Las notificaciones de `/talk` pasan a salir del tool:** cuando `recommend_nearby` o `get_place` devuelven lugares, la UI los muestra como notificación (más confiable que detectar nombres en la transcripción, que queda como respaldo).
- `MAX_OUTPUT_TOKENS` sigue en 500: el agente confirma en una frase, no lee el itinerario en voz alta.

---

## 7. Orden de las features

| # | Feature | Prioridad | Dueños |
|---|---|---|---|
| 1 | GPS simulado con joystick + mapa | Alta | B (UI), C (pings) |
| 2 | Onboarding y edición de gustos y restricciones | Alta | B (UI), C (datos) |
| 3 | Itinerario manual | Alta | C (server actions), B (UI) |
| 4 | ¿Qué hago? — voz con tools | Alta | A |
| 5 | ¿Qué estoy viendo? — foto | Alta | A (cámara y sesión), C (visión) |
| 6 | Traducción con residentes | Media | A (sesiones), B (UI), C (extracción) |
| 7 | Avisos proactivos por cercanía | Media | C (motor), B (UI), A (voz) |
| 8 | Itinerario creado por el agente | Media | C (planner), A (tool) |
| 8b | Google Calendar (leer y agendar) | Media | C (OAuth y API), B (botón), A (contexto y tool) |
| 9 | Video en vivo | Media | A, B |
| 10 | Viaje compartido | Baja | **A (todo: base, agente y pantallas)** |

Por qué este orden: el GPS va primero porque el contexto, la cámara y los avisos dependen de la ubicación. Los avisos van antes que el itinerario armado por el agente porque usan las recomendaciones de la traducción y cierran la historia de la demo. El video va último porque es lo más riesgoso y lo más caro, y la foto ya cubre el caso.

**Carriles:** Dev A = agente y voz. Dev B = app y UX (Nico). Dev C = datos y backend.

---

## 8. Cronograma

Horas relativas desde que arranca este plan. Está pensado para **~16 horas**: si les quedan más o menos, se estira o se comprime la Fase 3. Las reglas fijas son: **prioridad alta completa a mitad de camino** y **congelado de features tres horas antes del final**.

| Horas | Dev A — Agente y voz | Dev B — App y UX | Dev C — Datos y backend |
|---|---|---|---|
| H0–1 | **F0 (los tres)** | **F0** | **F0** |
| H1–3 | A-1 Tools en la sesión + `recommend_nearby` ✅ | B-1 Mapa + joystick | C-1 Migración + pings + ubicación en el contexto |
| H3–4 | A-1b Tareas en segundo plano + A-2 Contexto ampliado | B-2 Onboarding / editar perfil | C-2 Server actions de itinerario y perfil |
| **H4** | **Checkpoint 1** | | |
| H4–6 | A-3 `edit_itinerary`, `remember`, `get_place` + `session.update` | B-3 UI de itinerario | C-3 Visión con lugares candidatos |
| H6–8 | A-4 Foto en la sesión + B-4 Cámara | — (B-4 pasó a A) | C-4 Seed de la demo |
| **H8** | **Checkpoint 2 — prioridad alta completa** | | |
| H8–10 | A-5 Traductor portado del mock | B-5 UI de traducción | C-5 Extracción de recomendaciones |
| H10–11 | A-6 Avisos en voz | B-6 UI de avisos | C-6 Motor proactivo |
| **H11** | **Checkpoint 3** | | |
| H11–13 | A-7 `plan_day` o A-8 video | B-7 Panel de demo y pulido | C-7 Planner |
| **H13** | **Checkpoint 4 — congelado** | | |
| H13–15,5 | Demo y ensayo | Demo y ensayo | Demo y ensayo |
| H15,5–16 | Buffer | Buffer | Buffer |

En cada checkpoint, los tres prueban la demo completa durante 15 minutos.

---

## 9. Tareas

### F0 — Arranque (H0–1, los tres juntos)

- [ ] **F0-1** Todos con el repo levantado: `npm install`, `npx supabase start`, `npm run dev`, entrar con una cuenta demo.
- [ ] **F0-2** Leer en `node_modules/next/dist/docs/` lo que cada uno va a tocar (server actions, route handlers, caching).
- [ ] **F0-3** Acordar la migración de la sección 4 (C la escribe y la mergea primero).
- [ ] **F0-4** Acordar las firmas de los tools de la sección 6.
- [ ] **F0-5** Definir quién hace de residente francés y qué lugar recomienda en la demo.
- [ ] **F0-6** Completar `.env.example` con `GOOGLE_MAPS_API_KEY` (Places API New), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` (client OAuth "Rumbo") y el modelo de visión.

### Dev A — Agente y voz

- [x] **A-1** Tools en la sesión (H1–3). Registro de tools, `/api/realtime/tools`, `ResponseQueue`, `recommend_nearby` con `rank.ts` y tarjetas desde el resultado del tool. Probado con voz real (~US$0,01 por pregunta).
  - *Terminado:* "tengo una hora, ¿qué hago?" responde con un lugar que entra en el tiempo, y aparece la card.
- [x] **A-1b** Tareas en segundo plano (H3–4). Hecho: los tools lentos piden decir "dejame buscar" antes, hay timeout de 12 s, y si la charla siguió mientras corría el resultado llega con `late: true` para que el agente lo retome. Tools que responden "lo estoy buscando" al instante y meten el resultado después por la cola. Base para `search_places`, `search_events` y `plan_day`.
- [x] **A-2** Contexto ampliado (H3–4). Clima (Open-Meteo), plan de hoy con refs, estado y reservas, restricciones no negociables y lo aprendido (`compiled_summary`). La ubicación en vivo la manda el cliente (Nico). Falta solo el calendario (C-8).
- [x] **A-3** Tools de itinerario y memoria (H4–6). `edit_itinerary` (sobre las funciones de C-2, con refs cortas del plan y horas locales `HH:MM`; devuelve el plan actualizado), `remember` (guarda el hecho y, si es una dieta, la suma a `profiles.dietary` para que el ranking descarte parrillas y suba lo vegetariano) y `get_place` (con horario de hoy de Google Place Details). Con la llamada abierta, `session.update` rearma las instrucciones (`/api/realtime/instructions`, mismo armado que al abrir) cuando te movés 300 m o cambia `itinerary_items` (Supabase Realtime), como mucho cada 30 s y sin pedir respuesta. El aviso de "te moviste" lo sigue mandando el hook de Nico. También escucha `profiles` e `interests` (migración `20261017180000_realtime_profile.sql`), así que editar los gustos con la llamada abierta llega al agente.
- [x] **A-3b** `search_places` (Google Text Search, probado con voz) y `search_events` sobre "Que faire à Paris" (datos abiertos, gratis, sin key; `src/lib/events/paris.ts`). Una consulta ya filtrada por 3 km, fecha y tipo (música, teatro, exposición, cine, charla, niños, …), ordenada por distancia; se afina con las funciones (`occurrences`, cuya hora de París es buena pero el offset no) y quedan hasta 3 con función en la ventana (`now` = próximas 3 h, `today`, `tomorrow`). Se guardan en `places` (`qfap:<id>`, categoría "evento") para sumarlos al plan. ~1 s.
- [x] **A-3d** `web_search` sobre Serper (`SERPER_API_KEY`): menús, si tienen algo puntual, precios, eventos. Si la pregunta es sobre lo que tiene un lugar, **lee su web oficial** (`websiteUri` de Google Places, en paralelo con la búsqueda; si no, la oficial entre los resultados; nunca directorios) y sigue el link a "menu/carte". Probado con voz: Bouillon République → platos de su web en ~4 s. No sirve con menús en PDF o imagen, ni con webs que se arman con JavaScript.
- [ ] **A-3c** `add_to_calendar` (cuando C-8 esté). "Agendame la clase de cocina" o "pasá el plan de hoy a mi calendario".
- [x] **A-4** Foto en la sesión (H6–8). Lo que reconoce la foto entra como nota de sistema (`note(…, { keep: true })`): si la llamada no está abierta, queda en espera y se manda al abrirla, antes del saludo. Probado: foto de Place des Vosges, después "¿cuánto tarda la visita?" → `get_place` de ese lugar y "unos 30 minutos". ~US$0,01 la llamada.
- [x] **B-4** Cámara (H6–8), **hecha por Dev A**. Botón de cámara en `/talk` (con o sin llamada): panel con la cámara trasera en vivo y "Subir foto" (`CameraSheet`). La foto sale como JPEG de 1024 px (`src/lib/camera/resize.ts`) a `/api/vision`. Parado al lado del lugar, Jev lo elige entre los de 250 m y devuelve el lugar completo en ~1,2 s (Place des Vosges: confianza 0,87). Si no está entre esos (la foto es de algo más lejos), responde el LLM solo con el nombre y `/api/places/resolve` lo busca en `places` o en Google. El resultado se muestra con la UI generativa ("Llevame", "Al plan"). Por el camino largo, foto a pantalla en ~9 s (visión 4,2 s, ubicar 1,5 s, pantalla 2,9 s).
  - *Terminado:* después de la foto, "¿cuánto tarda la visita?" responde sobre ese lugar.
- [x] **A-5** Traductor (H8–10). Probado con audio generado (francés → español y español → francés, ~US$0,03). Hecho:
  - **Hook** `useTranslator` (`src/hooks/use-translator.ts`). Hay una sola sesión abierta por vez y solo mientras alguien habla: apretar "hablo yo" o "habla" abre esa dirección; soltar o cambiar de quien habla deja terminar la traducción, manda `session.close` y corta. Si nadie habla durante un minuto, se corta solo. Al cerrar la pestaña no queda nada abierto.
  - **Rutas:** `/api/translate/session` (key efímera; la primera vez crea la conversación `kind = 'translation'` con `lang_pair`), `/api/translate/messages` y `/api/translate/end`. En `end` se va a enganchar la extracción (C-5).
  - **Transcript:** el mock no lo traía, pero con `audio.input.transcription` (`gpt-realtime-whisper`) también llega lo que se dijo en el idioma original (`session.input_transcript.delta`). Se guarda en `messages`: el original en `content`, la traducción en `translated_text`, y el viajero como `user` y el residente como `local`. `UtteranceBuilder` arma una frase por turno (de apretar a soltar): el original y la traducción llegan en bloques con huecos de más de 4 s, así que cortar por pausas partía las oraciones.
  - **Vive en `/talk`, no en una pantalla aparte**: el traductor es un modo de la pantalla del agente (botón "Traducir"). Arriba la charla (burbujas con el original abajo), debajo la UI generativa con lo que recomienda la persona local, y los botones de quién habla. Al entrar se silencia el mic del agente para que no conteste la charla traducida; al salir se restaura. Componente `TranslatorPanel`; B-5 lo rediseña sin tocar el hook.
  - **Lo que recomienda la persona local llega al agente y a la pantalla.** Después de cada turno suyo, `/api/translate/tips` (gpt-6-luna con salida estructurada, ~US$0,0002, con los 4 turnos anteriores como contexto) saca los lugares concretos que recomienda, los ancla a `places` (si no están, Google Text Search) y los guarda en `local_tips`. Eso adelanta lo central de **C-5**, pero por turno y en vivo. Con los lugares se pide una pantalla a la UI generativa ("Llevame", "Al plan"). Si la llamada está abierta, cada turno y cada recomendación entran como nota de sistema (sin pedir respuesta). Además `buildInstructions` suma "Te recomendaron gente del lugar…" (lo último del viaje, uno por lugar), y `local_tips` está en la lista de tablas que refrescan la llamada abierta.
  - Por WebRTC `session.closed` no llega: después de `session.close` se espera 1 s y se corta. Al soltar, cierra ~3,5 s después de las últimas palabras.
  - Los nombres propios se traducen ("Marché des Enfants Rouges" → "mercado de los Niños Rojos") y a veces sale español de España ("id", "os gusta"): no se puede elegir la variante.
- [ ] **A-6** Avisos en voz (H10–11). Si llega una notificación con la llamada abierta, inyectar el motivo con `conversation.item.create` y pedir la respuesta **por `ResponseQueue`**, para que el agente lo diga sin que se lo pidan y sin pisar a nadie.
- [ ] **A-7** Tool `plan_day` (H11–13). Llama al planner (C-7), responde al instante y el resultado aparece en la UI por Realtime.
- [ ] **A-8** Video en vivo (solo si en el checkpoint 3 todo está en verde y se acepta el costo). Mientras la cámara está abierta, capturar un cuadro chico al empezar a hablar y mandarlo a la visión de C-3. Es la feature más cara: medir antes con el medidor de costo.

### Dev B — App y UX

- [x] **B-1** Mapa y GPS simulado (H1–3). **Hecho**, más: salto a cualquier lugar del mundo (buscador con Google Places, pin arrastrable) y mini mapa con joystick en `/talk` para caminar mientras hablás (ubicación en vivo a los tools y aviso a la llamada cada 150 m).
  - **`LocationProvider` en el layout raíz** con un único hook `useLocation()`. **Nadie llama a `navigator.geolocation` directamente.** Fuente simulada por defecto, real con un toggle. Al vivir en el layout, el joystick sigue moviendo el pin aunque cambies de pantalla.
  - **Pantalla `/map`** a pantalla completa con Google Maps (Maps JavaScript API, key pública restringida por dominio): pin del usuario, lugares cercanos (los "para vos" destacados), itinerario de hoy. La home tiene un acceso al mapa.
  - Joystick (nipplejs) flotante sobre el mapa que mueve el pin a 1,4 m/s con multiplicador x1, x5 y x20. Tocar el mapa teletransporta. B-7 reutiliza este mismo joystick, no se duplica.
  - **`savePing({ lat, lng, heading, source })` lo escribe B** (server action que inserta en `pings`), cada 5 s o cada 25 m. C-1 crea la tabla y hace que `getTravelerContext()` use el último ping.
  - Cuando te movés más de ~100 m, `router.refresh()` para que la home, `/talk` y el contexto del agente se actualicen.
  - *Terminado:* mover el joystick mueve el pin, y al recargar la home la ubicación y los lugares cercanos cambiaron.
- [ ] **B-2** Onboarding y edición de perfil (H3–4). Las cuentas demo ya tienen perfil, así que esto es sobre todo **"Editar mis gustos"**: chips para `interests` y selectores para dieta, movilidad, presupuesto, ritmo y horario. El mismo formulario sirve de onboarding para una cuenta nueva.
  - *Terminado:* cambio una restricción y la siguiente respuesta del agente la respeta.
- [ ] **B-3** UI de itinerario (H4–6). Arranca sumando el **cliente de Supabase para el navegador** (`src/lib/supabase/client.ts`), que también usa B-6 para Realtime. Sobre la sección que ya existe en la home: agregar (eligiendo de `places` o con texto libre), editar horario, marcar hecho o saltado, borrar. Mostrar el origen de cada actividad ("recomendado por Camille"). Suscripción Realtime a `itinerary_items`, para que lo que agrega el agente aparezca solo.
- [ ] **B-5** UI de traducción (H8–10). ~~Pantalla propia `/translate`~~ **Cambio: el traductor es un modo de `/talk`** (`TranslatorPanel`, para mostrar la UI generativa con lo que recomienda la persona local): acá sí hay burbujas, porque mostrarle el texto al residente es la función. Burbujas bilingües en vivo, botón para mostrarle el texto grande al residente y, al terminar, cards de recomendaciones con la cita original y la traducción (guardar, al plan, descartar).
- [ ] **B-6** UI de avisos (H10–11). La notificación de `/talk` para los lugares que recomienda el agente ya existe; falta la de **cercanía**: aviso con el mismo estilo que `PlaceNotification` (no un toast genérico) y sonido cuando entra una fila en `notifications`, también fuera de `/talk`. Tocar el aviso abre `/talk`.
- [ ] **B-8** Botón "Conectar Google Calendar" en el perfil (aparte del login demo) e ícono de calendario en las actividades que vienen de ahí.
- [ ] **B-7** Panel de demo y pulido (H11–13). Reutiliza el joystick de B-1 y suma: velocidad, teletransporte, "forzar aviso", "ver contexto del agente" (lo que devuelve `buildInstructions()`) y **"reiniciar demo"** (`npx supabase db reset` o un reset equivalente desde la app).

### Dev C — Datos y backend

- [x] **C-1** Migración, pings y ubicación (H1–3). Migración de la sección 4 en `supabase/migrations/20261017120000_rumbo_features.sql`. `getTravelerContext()` usa la ubicación en vivo si el cliente la manda (`options.location`), si no el último ping y si no el centro del viaje, y expone `locationSource` (`'live' | 'ping' | 'trip' | 'fallback'`); `locationLabel` sale de `nearestPlaceLabel()` en `src/lib/geo.ts`; los lugares con `listed = false` no aparecen como cercanos. El contexto también trae `constraints` (dieta, movilidad, presupuesto, ritmo, horario) y `profileSummary` para A-2, y cada actividad trae `status`, `source`, `locked` y `place_id`.
- [x] **C-2** Itinerario y perfil (H3–4). La lógica está en `src/lib/data/itinerary.ts` y `src/lib/data/profile.ts`: reciben el cliente de Supabase del usuario (`await createClient()`) y devuelven `Result` (`{ ok, data } | { ok, error }`, error en español listo para decir o mostrar).
  - **Itinerario:** `addItineraryItem` (con `placeId` toma nombre, ubicación y duración del lugar), `updateItineraryItem` (editar o mover; si cambia solo el comienzo conserva la duración), `setItineraryStatus`, `removeItineraryItem`, `undoItinerary`. Cada cambio guarda antes una copia en `itinerary_snapshots` (últimas 20 por viaje) y deshacer la restaura en una sola transacción (`supabase/migrations/20261017140000_itinerary_undo.sql`). Con `actor = 'agent'` no se mueven ni borran reservas (`locked`).
  - **Perfil:** `updateProfile` (gustos de `INTEREST_TAGS` y restricciones), `rememberFact` (con `supersedes` para reemplazar un hecho anterior) y `forgetFact`. Los dos últimos regeneran `compiled_summary` con una plantilla (`src/lib/profile/summary.ts`).
  - **UI (B-2, B-3):** server actions en `src/app/itinerary/actions.ts` y `src/app/profile/actions.ts`, que llaman a `refresh()` si el cambio salió bien.
  - **Tools (A-3):** desde `run-tool.ts`, llamar directo a las funciones de `src/lib/data` con `actor = 'agent'` (no a las server actions).
- [x] **C-3** Visión con lugares candidatos (H4–6). `POST /api/vision` (multipart: `photo` JPEG o PNG hasta 4 MB, y opcionalmente `lat`/`lng` en vivo) → `{ success, data: { via, name, description, confidence, place } }`. `place` tiene la forma de `PlaceCard` (la misma de las notificaciones de `/talk`) o es null.
  - **Jev** (TypeSafe, `src/lib/vision/jev.ts`) elige entre los lugares de `places` a menos de 250 m (hasta 8) o "ninguno". Responde en ~0,5 s. La descripción sale de `places.description`.
  - Si dice "ninguno", la confianza es menor a 0,5 o falla: **`gpt-5.6-luna`** (`VISION_MODEL`, `src/lib/vision/describe.ts`) mira la foto con la ubicación y sin opciones y devuelve **solo el nombre** (o null), en ~2 s. En ese caso `place` y `description` son null: explicar el lugar o sumarlo al plan lo hace el agente con sus tools (búsqueda web, `search_places`, que lo guarda en `places`, y `edit_itinerary`).
  - Keys: `TYPESAFE_API_KEY` (https://console.typesafe.ai/keys) y `OPENAI_API_KEY`. Las imágenes de Jev son experimentales (header `TypeSafe-Danger-Zone-Images`).
  - **B-4:** mandar JPEG de ~1024 px de lado mayor. Jev rechaza lados menores a 280 px o mayores a 1568 px; el server ajusta el tamaño antes de mandársela (`src/lib/vision/fit.ts`), así que una foto chica o enorme igual pasa por Jev.
  - **Batería de 10 casos** (`VISION_BATTERY=1 npm run test:vision`): Place des Vosges original, de noche, recortada, PNG de 400 px, blanco y negro borrosa y espejada; Capitolio original y recorte de la cúpula; Capitolio con el GPS en París (→ LLM lo nombra); imagen que no es un lugar (→ null). 10/10, Jev 0,97–1,00 en 0,4–0,8 s y LLM en ~2 s.
  - Probado con APIs reales (`npm run test:vision`, ver `src/lib/vision/identify.e2e.test.ts`): foto del Capitolio de EE. UU. → Jev 0,97 en ~0,5 s; con señuelos (otros capitolios con cúpula, Panteón, Empire State…) elige el real al 100% y, sin el real, "ninguno" al 90%; Capitolio fuera de los candidatos → LLM lo nombra en ~2,4 s; imagen que no es un lugar → LLM null; Jev con error → LLM.
  - **Terminado:** con el GPS en Place des Vosges, una foto real de la plaza (`src/lib/vision/fixtures/place-des-vosges.jpg`) la identifica Jev con confianza 1,0 en ~0,85 s; por HTTP, logueado como Lucía, `POST /api/vision` responde en ~1,4 s. La ruta rechaza sin foto (400) y formatos que no son JPEG/PNG (415); sin sesión, el proxy redirige a `/login` antes de llamar a ninguna API.
- [ ] **C-4** Seed de la demo (H6–8). Lo de la sección 4: lugares con `listed = false`, restricciones de las 3 cuentas, y una ruta que pase cerca del lugar que recomienda el residente.
- [x] **C-5** Extracción de recomendaciones (H8–10). **Hecho por A, en vivo:** después de cada turno del residente, `/api/translate/tips` saca los lugares que recomienda, los ancla y los guarda en `local_tips` (ver A-5). C sumó las acciones de las cards:
  - Server actions `saveTip`, `dismissTip` y `addTipToItinerary(id, startsAt)` en `src/app/tips/actions.ts` (lógica en `src/lib/data/tips.ts`, también para tools del agente). Sumar al plan crea la actividad con `source = 'local_tip'`, `source_ref` = la recomendación y la nota "Te lo recomendó Camille…", y la marca `in_plan`. Necesita que la recomendación esté anclada (`place_id`).
  - *Terminado:* la charla de la demo produce la card de la crêperie, anclada al lugar correcto.
- [ ] **C-6** Motor proactivo (H10–11). Se ejecuta en cada ping. Candidatos: `local_tips` guardados, actividades futuras del itinerario y lugares que coinciden con los gustos. Reglas: menos de 150 m, nunca repetido, una pausa entre avisos configurable (1 min en la demo) y sin chocar con la próxima actividad `locked`. **El texto se arma con una plantilla**, sin modelo: "Estás a 2 min de X, que te recomendó Y". Inserta en `notifications`.
  - *Terminado:* caminar con el joystick junto a la crêperie dispara el aviso con el nombre de quien la recomendó.
- [ ] **C-7** Planner (H11–13). Modelo de texto con salida estructurada. Recibe perfil, restricciones, `local_tips`, lugares con minutos de visita y actividades `locked`. **Solo puede usar lugares de `places`.** Los traslados salen de `walkMinutes()`. Guarda un snapshot antes de escribir y marca lo nuevo con `source = 'agent'`.

- [ ] **C-8** Google Calendar. Portar `~/git/adven/backend/app/integrations/google_calendar/oauth_client.py`: `access_type=offline` + `prompt=consent`, `singleEvents=true`, marca en los eventos que crea la app. Ruta de callback, tokens en `google_accounts`, eventos de hoy y mañana mezclados en `getTravelerContext()` como `locked`, y una función para crear eventos que usa A-3c. Sin sync token: `timeMin`/`timeMax` al abrir la sesión.
- [x] **C-9** Módulo de Google Places (New). Nearby Search con cache (`src/lib/places/nearby.ts`) y Text Search (`src/lib/places/search.ts`, hecho por A para `search_places`); C-5 lo usa para anclar las recomendaciones.

### Viaje compartido — hecho entero por Dev A

Se adelantó aunque era de prioridad baja. **Lo hizo todo Dev A**, incluida la base (carril de C) y las pantallas (carril de B): nadie más tiene que hacer nada, solo aplicar la migración.

- [x] **L-1** Varias personas, cada una con su cuenta y su teléfono, en el mismo viaje. "Mismo agente" quiere decir la misma memoria, **no** una sola sesión de audio: cada uno tiene su llamada, y comparten el itinerario, las recomendaciones de locales (`local_tips`) y las restricciones. Cada cambio queda firmado.
  - **Base** (`supabase/migrations/20261017200000_shared_trips.sql`):
    - `trip_members`: el dueño también es miembro (los viajes existentes se migran y un trigger suma al dueño de los nuevos).
    - `trip_invites`: códigos de 6 caracteres que vencen a los 7 días.
    - Funciones `join_trip(code)`, `leave_trip(trip_id)` y `active_trip_id()`. El viaje activo es el último al que te sumaste entre los que incluyen hoy, así que al sumarte a otro viaje pasa a ser ese, y al salir volvés al tuyo.
    - Los permisos de `trips`, `itinerary_items`, `itinerary_snapshots` y `local_tips` pasan de "dueño" a "miembro" (`is_trip_member()`, security definer para evitar recursión en RLS).
    - Entre compañeros de viaje se pueden leer `profiles` e `interests` (`shares_trip_with()`).
    - `itinerary_items.created_by` y `updated_by` guardan quién hizo cada cosa.
    - **Deshacer solo deshace lo propio:** si el último cambio es de otra persona, `restore_itinerary_snapshot` devuelve -1 y la app dice "Lo último lo cambió Sofía: deshacelo a mano". Así no se borra lo que sumó otro.
  - **Datos:** `src/lib/data/trips.ts` (miembros, invitar, sumarse, salir). Las tres copias de "buscar el viaje activo" (en `session.ts`, `itinerary.ts` y el traductor) ahora usan `active_trip_id()`. `TravelerContext.companions` trae a los demás del viaje.
  - **Agente:**
    - Las instrucciones suman "Viaje compartido con Sofía (vegetariano)…".
    - El plan marca "(sumó Sofía)".
    - `recommend_nearby` respeta la dieta de todo el grupo.
    - La llamada abierta también se refresca cuando cambia `trip_members`.
  - **Pantallas:**
    - En la home, la sección "Viajan juntos": quiénes viajan y qué no negocia cada uno, "Invitar a alguien" (código y link), "Unirme" con un código y salir del viaje.
    - El link `/join/<código>` te suma y te lleva a la home.
    - En el itinerario, "Lo sumó Sofía".
    - Aviso en vivo "Sofía sumó X al plan" o "cambió la hora de X" (`useCompanionActivity`, con el payload de Realtime que ahora pasa `onTableChange`).
  - **Probado** (gratis, con la base local y el navegador): Lucía invita, Sofía se suma, Sofía suma una actividad y a Lucía le aparece el aviso y "Lo sumó Sofía". Lucía no puede deshacer lo de Sofía, Sofía sí puede deshacer lo suyo. Mateo, que no está en el viaje, no ve nada. El agente de Lucía recibe la línea del grupo y el "(sumó Sofía)". El link de invitación y "Salir del viaje" funcionan.
  - **Dos llamadas a la vez, probado** (~US$0,02; dos pestañas, una en `localhost` y otra en `127.0.0.1` con `allowedDevOrigins` puesto solo para la prueba). Sofía se sumó con el código desde su pantalla y le dijo a su agente "sumá el Museo Picasso a las 17:30". A los 32 s, la llamada de Lucía recibió el `session.update` con "Museo Picasso (sumó Sofía)", y a "¿Sofía sumó algo al plan?" respondió "Sí, Sofía sumó el Museo Picasso". También le atribuyó a Sofía la clase de cocina de Lucía: ahora las instrucciones aclaran que lo que no dice "(sumó …)" lo sumó el viajero, pero ese ajuste no se volvió a probar con voz.
  - **Arreglo que salió de la prueba:** Realtime no exige el esquema estricto y el modelo llamó a `edit_itinerary` sin `item_ref` ni `title`, así que el tool respondía "Argumentos inválidos". `fillMissingNulls` completa con null los campos que aceptan null antes de validar.
  - **Falta:** probarlo con dos teléfonos reales. Si `/join/<código>` se abre sin sesión, va al login y se pierde el código. El agente suma actividades aunque la hora ya haya pasado (Picasso a las 17:30 cuando eran las 21).
- Una sola sesión de audio con varios participantes no se intenta.

---

## 10. Checkpoints y reglas de recorte

| Momento | Qué tiene que funcionar | Si no funciona |
|---|---|---|
| **H4** | Me muevo con el joystick → "tengo una hora, ¿qué hago?" → recomienda algo cercano a la nueva ubicación | B y C ayudan a A con los tools |
| **H8** | Las 5 features de prioridad alta de punta a punta. **Grabar video de respaldo #1** | La prioridad media se reduce a traducción y avisos |
| **H11** | Traducción y avisos funcionando | No se empieza video (el viaje compartido ya está hecho) |
| **H13** | Congelado de features | Lo que no funciona se esconde de la UI, no se arregla |

Quien termina su carril antes no empieza una feature nueva: pule la demo o ayuda al carril más atrasado.

Fase final: ensayar el guion completo tres veces con cronómetro y **grabar el video de respaldo #2**.

---

## 11. Guion de demo (3 minutos)

Con la cuenta de **Lucía**.

| Tiempo | Momento | Feature |
|---|---|---|
| 0:00 | Home: gustos, restricciones e itinerario de hoy | Onboarding |
| 0:20 | Joystick: caminamos del Pompidou hacia el Marais y el pin se mueve | GPS |
| 0:35 | "Tengo una hora antes de la clase de cocina, ¿qué hago?" → Marché des Enfants Rouges → "agregalo" → aparece en el plan | Voz + itinerario |
| 1:05 | Foto de Place des Vosges → "¿qué es esto?" → repregunta | Cámara |
| 1:35 | Charla traducida con una residente francesa → card "te lo recomendó Camille" | Traducción |
| 2:10 | Pasamos cerca → el agente avisa solo y nombra a Camille | Proactivo |
| 2:35 | "Armame mañana" o video en vivo, lo que haya llegado | Extra |
| 2:50 | Cierre: el panel muestra todo lo que el agente sabe del viaje | Cierre |

---

## 12. Trampas conocidas

- **Next.js 16:** leer la documentación local antes de usar cualquier API de Next.
- **Costo:** el traductor se cobra por minuto abierto y el video es caro. Mirar el medidor de costo al probar.
- **zod 4 + tools:** `.optional()` hace que el tool falle en silencio; usar `.nullable()`.
- **Supabase Realtime con RLS:** pasar el token del usuario (`realtime.setAuth`) antes de suscribirse; si no, los eventos se filtran sin avisar (`onTableChange` en `src/lib/supabase/client.ts`).
- **Nunca mandar `response.create` directo** con la llamada abierta: el VAD crea sus propias respuestas y OpenAI rechaza una segunda. Todo pasa por `ResponseQueue`.
- **Server actions en serie:** Next las despacha de a una por cliente. Para trabajo en paralelo o lento, route handler.
- **Nombres propios deformados** por la traducción: anclar los lugares con búsqueda tolerante a errores y probar los nombres de la demo antes.
- **Con el traductor no llega el transcript de entrada** por WebRTC, solo el de salida.
- **Chrome no reenvía audio remoto directo a otra conexión WebRTC** (manda silencio): pasarlo por Web Audio. Detalle en `docs/realtime-mock/README.md`.
- **El navegador integrado del editor bloquea el micrófono:** probar en Chrome.
- **Que el agente no lea el itinerario en voz alta:** que lo escriba y confirme en una frase.
- **iCloud:** no trabajar en Desktop/Documents con "Optimizar almacenamiento": iCloud vacía archivos (incluso dentro de `.git` y `.env.local`) y `git`/`next` se cuelgan. Clonar en una carpeta fuera de iCloud (por ejemplo `~/build101`).
- **Componentes reutilizables de la UI:** `Section`/`GroupedList` (listas tipo iOS), `CategoryIcon`, `PlaceNotification`, `ScrollFade`, `VoiceOrb`. Usarlos antes de crear algo nuevo.
