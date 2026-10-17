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
| Lugares | 15 lugares cargados a mano alrededor del Centre Pompidou y el Marais. **Son transitorios:** los lugares pasan a salir de Google Places (sección 3) y estos se borran del seed cuando C-1b y el tool de A estén andando | `supabase/seed.sql` |
| Home | Ubicación, día del viaje, gustos, itinerario de hoy y "Para vos" (lugares cercanos que coinciden con los gustos) | `src/app/page.tsx` |
| Contexto del viajero | `getTravelerContext()`: perfil, gustos, viaje activo, itinerario y lugares cercanos con distancia y minutos a pie | `src/lib/data/session.ts` |
| Geo | Distancia haversine, minutos caminando (factor 1,3 por calles) | `src/lib/geo.ts` |
| Motor de recomendaciones | **Borrado** al pasar a la llamada en tiempo real. Está en el historial (commit `58e8870`, con tests): A-1 lo recupera como base de `recommend_nearby` | `git show 58e8870:src/lib/agent/recommend.ts` |
| **Voz real** | **Llamada en tiempo real** con OpenAI Realtime por WebRTC, full-duplex: el servidor detecta los turnos (VAD) y si lo interrumpís se calla. **Modo bajo costo**: `gpt-realtime-2.1-mini`, sin transcripción del usuario, máximo 500 tokens de salida, contexto en las instrucciones, pide el mic antes de abrir la sesión, corta a los 60 s sin actividad, al salir de la página o al llegar a US$0,30. Medidor de costo en vivo | `src/app/api/realtime/session/route.ts`, `src/lib/realtime/*`, `src/hooks/use-realtime-call.ts` |
| Pantalla de voz | `/talk`: **sin chat ni transcripción**. Blob al centro que reacciona a tu voz y a la del agente, tarjeta de dónde estás (lugar, hora local, día del viaje, próximo compromiso) y **notificaciones estilo iOS** de los lugares que el agente va nombrando (se detectan en vivo en su transcripción de audio), apiladas con scroll y fade | `src/app/talk`, `src/components/rumbo/place-notification.tsx`, `scroll-fade.tsx` |
| Voz simulada | **Eliminada.** Se trabaja siempre con la llamada real (es barata) | — |
| Traductor (en el mock) | `gpt-realtime-translate` funcionando, una sesión por dirección, cierre automático | `docs/realtime-mock/public/app.js`, `docs/realtime-mock/server.mjs` |
| Comparación de proveedores | OpenAI Realtime elegido frente a ElevenLabs por latencia y costo | `docs/realtime-mock/COMPARISON.md` |

### Principios que respetamos

1. **Bajo costo primero.** Es una decisión del equipo: modelo `mini`, VAD del servidor (solo se factura la voz detectada, no el silencio), respuestas cortas, sesiones que se cierran solas. Ninguna feature nueva deja sesiones abiertas sin necesidad ni agrega llamadas a modelos donde una regla alcanza.
2. **El contexto va en las instrucciones, no en tools.** Así se cachea entre turnos. Como la sesión se cierra a los 60 s sin actividad, la próxima sesión ya arranca con el contexto actualizado. Dentro de una sesión abierta, los resultados de los tools traen la información nueva; `session.update` se usa solo cuando cambia algo grande (por ejemplo, te moviste más de 300 m).
3. **Seguimos con la conexión WebRTC propia.** No migramos al Agents SDK: los tools se agregan sobre `src/lib/realtime/connection.ts` y `src/hooks/use-realtime-call.ts`.
7. **`/talk` es una llamada, no un chat.** Nunca se muestra la transcripción. Lo único que aparece en pantalla además del blob es información útil: dónde estás y lo que el agente te va recomendando.
4. **Los tools llaman a server actions.** El mismo patrón que `src/app/talk/actions.ts`: respetan el login y los permisos por usuario sin trabajo extra.
5. **Un solo camino de código por operación.** Las funciones de itinerario las usan la UI y los tools por igual.
6. **El lugar es la entidad que conecta todo.** Recomendaciones del agente, recomendaciones de residentes, itinerario y avisos apuntan a una fila de `places`. `places` **no es un catálogo**: guarda solo los lugares que algo referencia, con el place id de Google como `id`. Los lugares cercanos los busca el agente en Google y no se guardan.

---

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Ciudad | **París**, alrededor del Pompidou y el Marais |
| Cuenta de la demo | **Lucía** (comida, mercados, parques): es la que mejor encaja con "un residente te recomienda un lugar" |
| Dónde se muestra | **Desde la laptop en `localhost`.** El micrófono funciona en localhost, el GPS es simulado y la cámara es la webcam o una foto subida. Deploy a la nube (Vercel + Supabase Cloud, o ngrok para HTTPS) **solo si sobra tiempo** |
| Residente en la demo | Alguien del equipo que hable **francés** (definir quién en F0) |
| Lugares | **Google Places (API New) es la fuente de lugares.** El agente busca con tools (Nearby Search y Text Search) y los resultados van directo al modelo, sin guardarse. Un lugar se guarda en `places` (upsert por place id de Google) solo cuando algo lo referencia: itinerario, recomendación de residente, aviso o recomendación del agente. La escritura la hace el server con la secret key de Supabase; para los usuarios `places` sigue siendo de solo lectura. Ver decisiones pendientes en la sección 3.1 |
| Traducción | **`gpt-realtime-translate`**, portado desde el mock. No una sesión del guía en modo intérprete |
| Visión | Una llamada aparte del server a un modelo de visión barato, no imágenes dentro de la sesión de voz. El resultado entra a la sesión como texto |

### 3.1 Decisiones pendientes (Google Places)

Salen de pasar los lugares del seed a Google. **Decidirlas entre los tres antes del checkpoint 1.**

| # | Tema | Qué pasa | Propuesta | Afecta a |
|---|---|---|---|---|
| 1 | **"Para vos" en la home y lugares en el mapa** | No pasan por el agente. Sin catálogo local, o llaman a Google en cada carga (y `router.refresh()` de B-1 lo multiplica) o se sacan | Llamar a Nearby Search desde el server con caché en memoria de unos minutos por zona. Si no llega, la home muestra solo itinerario y lugares guardados | B (B-1, home), C (C-1b) |
| 2 | **Avisos por "lugares que coinciden con tus gustos"** | El motor de avisos corre en cada ping (cada 5 s), sin el agente. Ese tipo de candidato necesitaría Google en cada ping | Sacarlo. Avisar solo por recomendaciones de residentes y actividades del plan, que tienen coordenadas en la base. Es lo que cuenta la historia de la demo | C (C-6), A (A-6) |
| 3 | **La sorpresa de la demo** | Antes, la crêperie se escondía con `places.listed = false`. Esa columna ya no existe, y si Lucía pregunta "¿dónde como?" antes de hablar con Camille, Google puede devolver justo la crêperie | Una lista chica de place ids a excluir en los tools de búsqueda, configurable, solo para la demo | A (tools), C (C-1b) |
| 4 | **Principio 2: contexto en las instrucciones** | El agente ya no arranca sabiendo qué hay cerca: lo pide con `recommend_nearby`. Suma una llamada a Google (cientos de ms) en la primera pregunta | Aceptarlo: los cercanos salen de las instrucciones y quedan solo en el tool. El resto del contexto (perfil, restricciones, itinerario, tips, ubicación) sigue en las instrucciones | A (A-1, A-2) |

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
             check (source in ('user','agent','local_tip','event')),
  add column source_ref uuid,                 -- id del local_tip que lo originó
  add column locked     boolean not null default false;  -- reserva: el planner no la mueve
-- place_id ya existe (text, sin FK): apunta a places.id

-- places: solo los lugares que algo referencia; id = place id de Google ("ChIJ...")
alter table public.places
  alter column city drop not null;            -- Google no siempre la devuelve
-- opening_hours, address y demás datos de Google van en places.data (jsonb)

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
```

Activar Supabase Realtime en `itinerary_items`, `local_tips`, `notifications` y `recommendations`.

### Seed

- Borrar los 15 lugares escritos a mano cuando C-1b y el tool de Google de A estén andando (antes no: la home y el agente se quedan sin lugares).
- Elegir en Google el lugar que el residente recomienda en la demo (ejemplo: una crêperie del Marais) y anotar su place id. No hace falta precargarlo: C-5 lo crea al anclar la recomendación. Para que el agente no lo sugiera antes, ver la decisión pendiente 3.
- Una ruta de caminata para la demo que pase cerca de ese lugar.
- Restricciones y ritmo para las 3 cuentas.

---

## 5. Contexto del agente

`buildInstructions()` en `src/lib/realtime/instructions.ts` ya arma el contexto con el nombre, los gustos, el estilo, la ubicación, la hora, el próximo compromiso y 8 lugares cercanos. Los 8 lugares salen del seed y dejan de existir con Google Places: el agente los pide con un tool (ver decisión pendiente 4). Se extiende con:

- **Restricciones** marcadas como no negociables (dieta, movilidad, presupuesto).
- **Perfil compilado** (`profiles.compiled_summary`), con lo aprendido en `profile_facts`.
- **Itinerario de hoy completo** con estado (hecho, saltado, pendiente), no solo el próximo compromiso.
- **Recomendaciones de residentes** guardadas, con quién las dio y a cuántos minutos están.
- **Ubicación real del GPS simulado**: el último ping, no el centro del viaje.

Hay que cuidar el presupuesto de tokens: lo que entra en las instrucciones se lee en cada turno. Ya existe `MAX_PLACES_IN_CONTEXT` en `src/lib/realtime/config.ts`; hacer lo mismo con las demás listas.

### Ubicación

Hoy `getTravelerContext()` usa **el centro del destino como ubicación fija**, y "Centre Pompidou" está escrito a mano en `locationLabel`. Se cambia a:
- `location` = último registro de `pings` del usuario, con el centro del viaje como respaldo.
- `locationLabel` = solo el nombre, sin "cerca de" (`/talk` y la home ya le ponen el texto alrededor). Mientras exista el seed, el lugar más cercano a menos de ~300 m ("Place des Vosges"). Sin catálogo local, el barrio vía Google (Geocoding inverso, con caché en memoria para no pagarlo en cada request) y la ciudad como respaldo.

---

## 6. Tools del agente

Se agregan a la sesión en `/api/realtime/session` (`tools` y `tool_choice` en la config). En `use-realtime-call.ts` se maneja la llamada a función: ejecutar la server action, enviar `conversation.item.create` con `function_call_output` y después `response.create`.

```
recommend_nearby(available_minutes: number|null, interest: string|null)
                                         → Google Nearby Search (C-1b) + reglas de recommend.ts
                                           recuperado de 58e8870; hasta 3 lugares
search_places(query: string)             → Google Text Search (C-1b): "una farmacia", "bar con terraza"
get_place(place_id: string)              → Google Place Details: descripción, horarios, minutos a pie
edit_itinerary(op: 'add'|'move'|'remove'|'done'|'skip'|'undo',
               item_id: string|null, place_id: string|null, title: string|null,
               starts_at: string|null, ends_at: string|null)
remember(statement: string, kind: 'constraint'|'preference')
plan_day(date: string, brief: string)    → prioridad media, asíncrono
```

Reglas:
- **zod 4: usar `.nullable()` y nunca `.optional()`** en los parámetros. El modo strict exige que todas las propiedades estén en `required`; si no, el tool falla en silencio.
- **Las restricciones se filtran en el server**, no en el prompt.
- **Respuestas cortas:** como máximo 3 resultados y pocos campos. Todo lo que devuelve un tool se lee como tokens de entrada.
- **Los resultados de Google no se guardan.** Se guardan en `places` solo cuando algo los referencia (por ejemplo `edit_itinerary` con un `place_id` de Google): el server hace el upsert antes de escribir la fila que apunta al lugar.
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
| 5 | ¿Qué estoy viendo? — foto | Alta | B (cámara), C (visión), A (sesión) |
| 6 | Traducción con residentes | Media | A (sesiones), B (UI), C (extracción) |
| 7 | Avisos proactivos por cercanía | Media | C (motor), B (UI), A (voz) |
| 8 | Itinerario creado por el agente | Media | C (planner), A (tool) |
| 9 | Video en vivo | Media | A, B |
| 10 | Viaje compartido | Baja | B, C |

Por qué este orden: el GPS va primero porque el contexto, la cámara y los avisos dependen de la ubicación. Los avisos van antes que el itinerario armado por el agente porque usan las recomendaciones de la traducción y cierran la historia de la demo. El video va último porque es lo más riesgoso y lo más caro, y la foto ya cubre el caso.

**Carriles:** Dev A = agente y voz. Dev B = app y UX (Nico). Dev C = datos y backend.

---

## 8. Cronograma

Horas relativas desde que arranca este plan. Está pensado para **~16 horas**: si les quedan más o menos, se estira o se comprime la Fase 3. Las reglas fijas son: **prioridad alta completa a mitad de camino** y **congelado de features tres horas antes del final**.

| Horas | Dev A — Agente y voz | Dev B — App y UX | Dev C — Datos y backend |
|---|---|---|---|
| H0–1 | **F0 (los tres)** | **F0** | **F0** |
| H1–3 | A-1 Tools en la sesión + `recommend_nearby` | B-1 Mapa + joystick | C-1 Migración + ubicación en el contexto |
| H3–4 | A-2 Contexto ampliado | B-2 Onboarding / editar perfil | C-1b Cliente de Google Places |
| **H4** | **Checkpoint 1** | | |
| H4–6 | A-3 `edit_itinerary`, `remember`, `get_place` | B-3 UI de itinerario | C-2 Server actions de itinerario y perfil |
| H6–8 | A-4 Foto en la sesión | B-4 Cámara | C-3 Visión con lugares candidatos + C-4 Seed de la demo (más chico: sin lugares) |
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
- [ ] **F0-6** Completar `.env.example` con `GOOGLE_MAPS_API_KEY` (**obligatoria**: los lugares salen de Google), `SUPABASE_SECRET_KEY` (para escribir en `places` desde el server) y el modelo de visión.
- [ ] **F0-7** Resolver las decisiones pendientes de la sección 3.1.

### Dev A — Agente y voz

- [ ] **A-1** Tools en la sesión (H1–3).
  - Agregar `tools` y `tool_choice` al mint en `/api/realtime/session`.
  - En `use-realtime-call.ts`, manejar las llamadas a función: ejecutar la server action, enviar `function_call_output` y `response.create`.
  - Primer tool: `recommend_nearby`, sobre `recommend.ts` recuperado del commit `58e8870` (con sus tests). Sus resultados se muestran como las notificaciones de `/talk`.
  - Arranca leyendo los lugares del seed; cuando llega C-1b (H4) cambia la fuente a Google Nearby Search sin cambiar la firma del tool.
  - *Terminado:* "tengo una hora, ¿qué hago?" responde con un lugar que entra en el tiempo, y aparece la card.
- [ ] **A-2** Contexto ampliado (H3–4). Extender `buildInstructions()` con lo de la sección 5. Actualizar `instructions.test.ts`.
- [ ] **A-3** Tools de itinerario y memoria (H4–6). `edit_itinerary`, `remember`, `get_place`. `session.update` solo cuando la ubicación cambia más de 300 m con la sesión abierta.
  - *Terminado:* "agregá el mercado a las cuatro" aparece en el itinerario de la home; "soy vegetariana" queda guardado y la siguiente recomendación lo respeta.
- [ ] **A-4** Foto en la sesión (H6–8). Cuando la cámara devuelve un resultado, inyectarlo como texto en la sesión (`conversation.item.create`) para poder repreguntar.
  - *Terminado:* después de la foto, "¿cuánto tarda la visita?" responde sobre ese lugar.
- [ ] **A-5** Traductor (H8–10). Portar `gpt-realtime-translate` del mock a la app: ruta para el token, hook con dos sesiones (una por dirección), botones "hablo yo" y "habla él/ella". **Mantener el cierre automático**: se cobra cada minuto abierto. Guardar el transcript en `conversations` (`kind = 'translation'`) y `messages`. Al cerrar, llamar a la extracción (C-5).
  - Solo llega el transcript de **salida**. Lo que dice el residente se guarda ya traducido al español; eso alcanza para la extracción.
  - *Terminado:* charla de un minuto en francés, traducida en ambas direcciones.
- [ ] **A-6** Avisos en voz (H10–11). Si llega una notificación con la sesión del guía abierta, inyectar el motivo con `conversation.item.create` y `response.create`, para que el agente lo diga sin que se lo pidan.
- [ ] **A-7** Tool `plan_day` (H11–13). Llama al planner (C-7), responde al instante y el resultado aparece en la UI por Realtime.
- [ ] **A-8** Video en vivo (solo si en el checkpoint 3 todo está en verde y se acepta el costo). Mientras la cámara está abierta, capturar un cuadro chico al empezar a hablar y mandarlo a la visión de C-3. Es la feature más cara: medir antes con el medidor de costo.

### Dev B — App y UX

- [ ] **B-1** Mapa y GPS simulado (H1–3).
  - **`LocationProvider` en el layout raíz** con un único hook `useLocation()`. **Nadie llama a `navigator.geolocation` directamente.** Fuente simulada por defecto, real con un toggle. Al vivir en el layout, el joystick sigue moviendo el pin aunque cambies de pantalla.
  - **Pantalla `/map`** a pantalla completa con react-leaflet y tiles de OpenStreetMap (no pide key): pin del usuario, lugares cercanos (los "para vos" destacados), itinerario de hoy. La home tiene un acceso al mapa.
  - Joystick (nipplejs) flotante sobre el mapa que mueve el pin a 1,4 m/s con multiplicador x1, x5 y x20. Tocar el mapa teletransporta. B-7 reutiliza este mismo joystick, no se duplica.
  - **`savePing({ lat, lng, heading, source })` lo escribe B** (server action que inserta en `pings`), cada 5 s o cada 25 m. C-1 crea la tabla y hace que `getTravelerContext()` use el último ping.
  - Cuando te movés más de ~100 m, `router.refresh()` para que la home, `/talk` y el contexto del agente se actualicen.
  - *Terminado:* mover el joystick mueve el pin, y al recargar la home la ubicación y los lugares cercanos cambiaron.
- [ ] **B-2** Onboarding y edición de perfil (H3–4). Las cuentas demo ya tienen perfil, así que esto es sobre todo **"Editar mis gustos"**: chips para `interests` y selectores para dieta, movilidad, presupuesto, ritmo y horario. El mismo formulario sirve de onboarding para una cuenta nueva.
  - *Terminado:* cambio una restricción y la siguiente respuesta del agente la respeta.
- [ ] **B-3** UI de itinerario (H4–6). Arranca sumando el **cliente de Supabase para el navegador** (`src/lib/supabase/client.ts`), que también usa B-6 para Realtime. Sobre la sección que ya existe en la home: agregar (eligiendo de `places` o con texto libre), editar horario, marcar hecho o saltado, borrar. Mostrar el origen de cada actividad ("recomendado por Camille"). Suscripción Realtime a `itinerary_items`, para que lo que agrega el agente aparezca solo.
- [ ] **B-4** Cámara (H6–8). Botón fijo: webcam o foto subida desde archivo. Card con el resultado de C-3 y "Agregar al plan".
- [ ] **B-5** UI de traducción (H8–10). **Pantalla propia `/translate`**, separada de `/talk`: acá sí hay burbujas, porque mostrarle el texto al residente es la función. Burbujas bilingües en vivo, botón para mostrarle el texto grande al residente y, al terminar, cards de recomendaciones con la cita original y la traducción (guardar, al plan, descartar).
- [ ] **B-6** UI de avisos (H10–11). Aviso con el mismo estilo que `PlaceNotification` de `/talk` (no un toast genérico) y sonido cuando entra una fila en `notifications`. Tocar el aviso abre `/talk`.
- [ ] **B-7** Panel de demo y pulido (H11–13). Reutiliza el joystick de B-1 y suma: velocidad, teletransporte, "forzar aviso", "ver contexto del agente" (lo que devuelve `buildInstructions()`) y **"reiniciar demo"** (`npx supabase db reset` o un reset equivalente desde la app).

### Dev C — Datos y backend

- [ ] **C-1** Migración y ubicación (H1–3). Escribir y mergear la migración de la sección 4 **primero**, porque A y B dependen de ella. La tabla `pings` es de C; la server action `savePing` es de B (B-1). Cambiar `getTravelerContext()` para que use el último ping y calcule `locationLabel` (sección 5).
- [ ] **C-1b** Cliente de Google Places (H3–4). Módulo server-only (`src/lib/google/places.ts`) sobre la Places API (New): Nearby Search, Text Search y Place Details, con **field mask mínimo** (los campos pedidos definen el costo). Traduce los `types` de Google a nuestros tags (`cafe` → `café`, `comida`) y pone `typical_visit_minutes` por categoría. `upsertPlace()` con un cliente admin de Supabase (`src/lib/supabase/admin.ts`, secret key) para guardar un lugar cuando algo lo referencia. Lo usan los tools de A, C-2, C-3, C-5 y la home (decisión pendiente 1).
  - *Terminado:* desde Place des Vosges, `nearby()` devuelve lugares reales con tags nuestros, y `upsertPlace()` dos veces con el mismo id deja una sola fila.
- [ ] **C-2** Server actions de itinerario y perfil (H4–6). Si la actividad apunta a un lugar de Google, `upsertPlace()` (C-1b) antes de escribirla. Agregar, editar, mover, borrar, cambiar estado y deshacer (con `itinerary_snapshots`). Guardar `profile_facts` y regenerar `compiled_summary`: con una plantilla alcanza, sin llamar a un modelo. Las usan la UI (B-3) y los tools (A-3).
- [ ] **C-3** Visión con lugares candidatos (H6–8). Ruta que recibe la foto y la ubicación, busca en Google (Nearby Search de C-1b) los lugares a menos de 250 m y se los pasa al modelo de visión como opciones: "Estás acá. Cerca hay: A, B, C. ¿Cuál se ve en la foto?". Devuelve lugar, confianza y una descripción corta.
  - *Terminado:* con el GPS en Place des Vosges, una foto de la plaza la identifica en menos de 5 s.
- [ ] **C-4** Seed de la demo (H6–8). Lo de la sección 4: borrar los lugares escritos a mano, restricciones de las 3 cuentas, place id del lugar que recomienda el residente y una ruta que pase cerca de él.
- [ ] **C-5** Extracción de recomendaciones (H8–10). Transcript de la traducción → modelo de texto con salida estructurada → filas en `local_tips`. Anclar cada una a un lugar con **Text Search de Google (C-1b) sesgado a la ubicación**, que tolera nombres deformados por la traducción ("La Mallorquina" → "La Maloyoschina"), y guardarlo con `upsertPlace()`. Si la confianza es baja, `place_id` queda en null y la card pide confirmar.
  - *Terminado:* la charla de la demo produce la card de la crêperie, anclada al lugar correcto.
- [ ] **C-6** Motor proactivo (H10–11). Se ejecuta en cada ping. Candidatos: `local_tips` guardados y actividades futuras del itinerario (lugares que coinciden con los gustos: ver decisión pendiente 2). Reglas: menos de 150 m, nunca repetido, una pausa entre avisos configurable (1 min en la demo) y sin chocar con la próxima actividad `locked`. **El texto se arma con una plantilla**, sin modelo: "Estás a 2 min de X, que te recomendó Y". Inserta en `notifications`.
  - *Terminado:* caminar con el joystick junto a la crêperie dispara el aviso con el nombre de quien la recomendó.
- [ ] **C-7** Planner (H11–13). Modelo de texto con salida estructurada. Recibe perfil, restricciones, `local_tips`, lugares con minutos de visita y actividades `locked`. **Solo puede usar lugares que existen en Google** (resultados de C-1b que se le pasan como opciones; los elegidos se guardan con `upsertPlace()`). Los traslados salen de `walkMinutes()`. Guarda un snapshot antes de escribir y marca lo nuevo con `source = 'agent'`.

### Prioridad baja — Viaje compartido (solo con todo en verde en el checkpoint 3)

- [ ] **L-1** Invitar a otra cuenta demo al mismo viaje. "Mismo agente" significa la misma memoria, **no** una sola sesión de audio: cada persona tiene su propia sesión y comparten itinerario, `local_tips` y preferencias, cada una atribuida a quien la dijo. Requiere ajustar los permisos por usuario de `trips` e `itinerary_items` para miembros del viaje.
- No intentar una sesión de audio con varios participantes.

---

## 10. Checkpoints y reglas de recorte

| Momento | Qué tiene que funcionar | Si no funciona |
|---|---|---|
| **H4** | Me muevo con el joystick → "tengo una hora, ¿qué hago?" → recomienda algo cercano a la nueva ubicación | B y C ayudan a A con los tools |
| **H8** | Las 5 features de prioridad alta de punta a punta. **Grabar video de respaldo #1** | La prioridad media se reduce a traducción y avisos |
| **H11** | Traducción y avisos funcionando | No se empiezan video ni viaje compartido |
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
- **Nombres propios deformados** por la traducción: anclar los lugares con búsqueda tolerante a errores y probar los nombres de la demo antes.
- **Con el traductor no llega el transcript de entrada** por WebRTC, solo el de salida.
- **Chrome no reenvía audio remoto directo a otra conexión WebRTC** (manda silencio): pasarlo por Web Audio. Detalle en `docs/realtime-mock/README.md`.
- **El navegador integrado del editor bloquea el micrófono:** probar en Chrome.
- **Que el agente no lea el itinerario en voz alta:** que lo escriba y confirme en una frase.
- **iCloud:** no trabajar en Desktop/Documents con "Optimizar almacenamiento": iCloud vacía archivos (incluso dentro de `.git` y `.env.local`) y `git`/`next` se cuelgan. Clonar en una carpeta fuera de iCloud (por ejemplo `~/build101`).
- **Componentes reutilizables de la UI:** `Section`/`GroupedList` (listas tipo iOS), `CategoryIcon`, `PlaceNotification`, `ScrollFade`, `VoiceOrb`. Usarlos antes de crear algo nuevo.
