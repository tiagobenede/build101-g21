# Planning — Polo

Hackathon · 3 desarrolladores. Este documento es la fuente de verdad del plan: qué construimos, cómo quedó implementado y qué falta. Cada tarea tiene un ID (`A-x`, `B-x`, `C-x`, `L-x`).

> **Antes de escribir código:** este repo usa **Next.js 16 con cambios incompatibles**. Leer la guía correspondiente en `node_modules/next/dist/docs/` (ver `AGENTS.md`). No escribir Next "de memoria".

**Estado (17/10, noche):** la historia completa de la demo funciona de punta a punta, también en el iPhone como PWA: voz con tools, cámara, traductor con residentes, recomendaciones guardadas, avisos por cercanía (en pantalla y push) y viaje compartido. Lo que queda sin hacer es lo de prioridad media y baja: el planner (`plan_day`), Google Calendar, video en vivo y el panel de demo.

> La app se llama **Polo** (antes Rumbo). Solo cambió el nombre visible y cómo se presenta el agente: los identificadores internos, los mails demo (`@rumbo.demo`), las claves de `localStorage` (`rumbo.*`) y las migraciones siguen como estaban.

---

## 1. Producto

Polo es un guía de viaje por voz. Conoce tus gustos y restricciones, lee y modifica tu itinerario, te recomienda qué hacer según dónde estás y el tiempo que tenés, identifica lo que ves con la cámara, traduce tus charlas con residentes y guarda lo que te recomiendan. Además te avisa por su cuenta cuando pasás cerca de algo que te interesa.

**El diferencial:** la traducción alimenta la memoria. Lo que un residente te recomienda en francés queda guardado, anclado a un lugar del mapa, puede sumarse al plan y dispara un aviso cuando pasás cerca:

> "Estás a 2 min de Breizh Café, que te recomendó Camille, la de la panadería."

---

## 2. Qué hay hoy

| Área | Cómo funciona | Dónde |
|---|---|---|
| App | Next.js 16 + shadcn/ui, estilo iOS. **Home con mapa a lo ancho y barra de pestañas abajo** (Inicio, Mapa, Viaje, Perfil) con el blob de voz en el medio. PWA instalable (manifest, ícono, service worker) | `src/app/(tabs)`, `src/components/rumbo`, `public/sw.js` |
| Login | Cuentas demo: **Tiago** (autos, diseño, café), **Lucas** (museos, historia, librerías), **Nicolas** (comida, mercados, parques) y **Alex Romero** (primer login: arranca con el onboarding). Password en `DEMO_PASSWORD` | `src/lib/demo-accounts.ts`, `supabase/seed.sql` |
| Onboarding | **Por voz**, en el primer login: el blob pregunta, aparecen palabras clave, al final un resumen para revisar y un tick de éxito. Guarda gustos y restricciones y marca `profiles.onboarded_at` | `src/app/onboarding`, `src/components/onboarding` |
| Perfil | Gustos editables (también propios, fuera de la lista) y restricciones a la vista. Activar avisos push | `src/app/(tabs)/profile`, `src/components/profile` |
| Ubicación | `LocationProvider` en el layout raíz (`useLocation()`), simulada por defecto o GPS real. Joystick (x1, x5, x20), teletransporte y salto a cualquier ciudad del mundo. Pings a `pings` cada 5 s o 25 m. Esquina exacta y coordenadas para el agente (`where_am_i`) | `src/components/location`, `src/lib/location` |
| Lugares | **Google Places (New)**: Nearby Search por zona (`place_cells`, una vez por zona y se renueva), Text Search, Place Details (horarios, teléfono, fotos). Todo se guarda en `places` | `src/lib/places` |
| **Voz** | OpenAI Realtime por WebRTC, **llamada full-duplex** (`gpt-realtime-2.1-mini`, voz `marin`, `server_vad` con interrupción). Hasta 700 tokens de salida. Se corta a los 60 s sin actividad, al ocultar la página o a los US$0,30. Medidor de costo en vivo. Tocar el blob arranca a hablar | `src/hooks/use-realtime-call.ts`, `src/lib/realtime` |
| Tools | 13 tools (sección 6), corren en el server con el login del usuario y entran a la charla por `ResponseQueue` sin chocar con las respuestas del VAD | `src/lib/realtime/tools.ts`, `src/lib/agent/run-tool.ts` |
| **UI generativa** | `/talk` no tiene chat: lo que dicen los tools se muestra como pantallas generadas (OpenUI, `gpt-6-luna`): lugares con foto de Google y horario, ruta a pie ("Llevame"), frases para decir, lo que ves en la foto. Botones "Llevame" y "Al plan" | `src/components/genui`, `src/lib/genui` |
| **Cámara** | "¿Qué estás viendo?" a **pantalla completa** como la cámara del teléfono (o foto del carrete). Jev elige entre los lugares a 250 m; si no, `gpt-5.6-luna` nombra el lugar, la obra o la cosa. El agente avisa "estoy mirando la foto" apenas sale, y después cuenta qué es | `src/components/camera`, `src/app/api/vision`, `src/lib/vision` |
| **Traductor** | Modo de `/talk` (botón "Traducir" o el agente con `open_translator`). `gpt-realtime-translate`, una sesión solo mientras alguien habla. Voz de la traducción con **ElevenLabs**. Idioma de la otra persona según dónde estás. Cada mensaje del lado de quien habló (yo a la izquierda) | `src/hooks/use-translator.ts`, `src/components/translate` |
| Recomendaciones de residentes | Después de cada turno del residente se extraen los lugares que recomienda, se anclan a `places` y se guardan en `local_tips` (guardadas por defecto). Cards durante la charla: Agendar, Llevame, Descartar. Al cerrar la charla se arma un resumen que el agente recibe si la llamada empieza en los 5 min siguientes | `src/app/api/translate/tips`, `src/lib/translate` |
| Avisos por cercanía | Motor por reglas (recomendaciones y plan a 150 m) y Jev para gustos (100 m). Banner en la app (Realtime) y **Web Push** del sistema (también en iPhone como PWA) | `src/lib/proximity`, `src/components/notifications`, `src/lib/push` |
| Itinerario | Editable en la home y por el agente. Deshacer con snapshots. Reservas (`locked`) que el agente no mueve | `src/lib/data/itinerary.ts` |
| Viaje compartido | Varias personas, mismo itinerario, recomendaciones y restricciones; cada uno con su llamada. Invitación con código o link | `src/lib/data/trips.ts`, `/join/[code]` |

### Principios que respetamos

1. **Bajo costo primero.** Modelo `mini`, respuestas cortas, la llamada se corta sola (60 s sin actividad, al salir o a los US$0,30). El traductor abre sesión solo mientras alguien habla. Ninguna feature agrega llamadas a modelos donde una regla alcanza.
2. **El contexto va en las instrucciones, no en tools.** Se cachea entre turnos. `session.update` rearma las instrucciones cuando te movés 300 m, cambia el plan, el perfil, los gustos, los miembros del viaje o las recomendaciones (como mucho cada 30 s), y cada 5 min para que la hora siga al día.
3. **Conexión WebRTC propia.** No usamos el Agents SDK.
4. **Los tools corren en el server con el login del usuario**, por el route handler `/api/realtime/tools` (no server actions: Next las despacha de a una por cliente).
5. **Fuentes externas como tools propios**, sin MCP: así se recortan a 3 resultados y se guardan en `places`.
6. **Un solo camino de código por operación.** Las funciones de `src/lib/data` las usan la UI, las server actions y los tools.
7. **El lugar es la entidad que conecta todo.** Recomendaciones, itinerario, avisos y fotos apuntan a una fila de `places`.
8. **`/talk` es una llamada, no un chat.** Nunca se muestra la transcripción del agente; solo información útil.
9. **Lo que pasa en la pantalla se le cuenta al agente** con `note()`: en silencio (lo usa si le preguntan) o con `respond: true`, que le pide hablar por `ResponseQueue` (llegó a destino, foto, aviso).

---

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Ciudad | **Cualquiera**: el contexto, los lugares, la hora local y el idioma del traductor siguen a la ubicación. La demo es en **París** (Pompidou, Marais) |
| Cuenta de la demo | **Nicolas** (comida, mercados, parques): la que mejor encaja con "un residente te recomienda un lugar" |
| Dónde se muestra | En la laptop (`localhost`) o en el **iPhone como PWA por un túnel ngrok** (README, "Probar en el celular"): ahí andan mic, cámara, GPS real y push |
| Lugares | Todos de Google Places (New), sin seed |
| Eventos | `search_events` sobre "Que faire à Paris" (datos abiertos, sin key) |
| Clima | Open-Meteo, en las instrucciones |
| Traducción | `gpt-realtime-translate` (texto) + **voz de ElevenLabs** (la de OpenAI imita la voz de quien habla y no deja elegir) |
| Visión | Llamada aparte del server: **Jev** con los lugares candidatos y `gpt-5.6-luna` de respaldo. El resultado entra a la sesión como texto |
| Datos de guía | `place_facts` con `gpt-5.6-luna` (más preciso que el modelo de voz) |
| Calendario | Google Calendar con OAuth propio — **no hecho** (C-8) |

---

## 4. Base de datos

Supabase local. Todas las tablas con permisos por usuario (o por miembro del viaje). Migraciones en orden:

| Migración | Qué agrega |
|---|---|
| `20261017000000_init` | `profiles`, `interests`, `trips`, `itinerary_items`, `places`, `conversations`, `messages`, `recommendations` |
| `20261017120000_rumbo_features` | Restricciones y `compiled_summary` en `profiles`; estado, origen y reservas en `itinerary_items`; `places.listed`; `conversations.kind` y `lang_pair`; `messages.lang` y `translated_text`; tablas `local_tips`, `profile_facts`, `pings`, `notifications`, `itinerary_snapshots`, `google_accounts`; Realtime |
| `20261017140000_itinerary_undo` | Restaurar un snapshot en una transacción |
| `20261017160000_notifications_once` | Nunca dos avisos del mismo lugar |
| `20261017180000_realtime_profile` | Realtime en `profiles` e `interests` |
| `20261017200000_shared_trips` | `trip_members`, `trip_invites`, `join_trip`, `active_trip_id`, permisos por miembro, quién sumó cada cosa |
| `20261017210000_place_cells` | Zonas ya pedidas a Google |
| `20261017220000_push_subscriptions` | Suscripciones de Web Push |
| `20261017230000_onboarding` | `profiles.onboarded_at` |
| `20261017240000_translation_summary` | `conversations.summary` |
| `20261018000000_local_tips_saved_default` | Las recomendaciones se guardan solas |

`google_accounts` existe pero nadie la usa todavía (C-8). Después de un pull con migraciones nuevas: `npx supabase db reset` (borra los datos locales y vuelve a cargar el seed).

---

## 5. Contexto del agente

`buildInstructions()` (`src/lib/realtime/instructions.ts`) arma, al abrir la llamada y en cada `session.update`:

- Nombre, gustos, estilo, **restricciones no negociables** y lo aprendido (`compiled_summary`).
- Día, fecha y hora local; clima.
- Dónde está (lugar cercano, esquina) y hasta 20 lugares cercanos con minutos a pie.
- Plan de hoy (hasta 8) con estado, reservas y quién sumó cada cosa.
- Recomendaciones de residentes guardadas, con quién las dio.
- Compañeros de viaje y sus restricciones.
- Resumen de la última charla con el traductor si fue hace menos de 5 min.

---

## 6. Tools del agente

| Tool | Qué hace |
|---|---|
| `recommend_nearby` | Hasta 3 lugares cercanos que entran en el tiempo libre y van con los gustos (`rank.ts`). Descarta los cerrados o que cierran antes de terminar la visita; "cerca" y comida, a menos de 10 min |
| `search_places` | Google Text Search de un lugar o tipo puntual |
| `search_events` | Eventos de "Que faire à Paris" (ahora, hoy, mañana, por tipo) |
| `web_search` | Serper + la web oficial del lugar (menús, precios). Si no encuentra un precio, ofrece el teléfono |
| `place_facts` | Datos de guía seguros y una anécdota (lugar, obra, barrio, lo de la foto) |
| `get_place` | Abierto ahora, horario, teléfono, minutos a pie y de visita |
| `show_route` | Mapa con la caminata y minutos reales. Al llegar, el agente lo dice solo |
| `show_phrase` | Frase en el idioma local en pantalla, con traducción, pronunciación y audio |
| `where_am_i` | Calle, esquina y coordenadas |
| `edit_itinerary` | add, move, remove, done, skip, undo |
| `remember` | Guarda un hecho del viajero; con `interest`, suma o saca un gusto |
| `open_translator` | Abre el traductor cuando el viajero acepta ayuda con el idioma |
| `translation_transcript` | La charla entera con el residente, si el resumen no alcanza |

Reglas: zod 4 con `.nullable()` (nunca `.optional()`); `fillMissingNulls` completa lo que el modelo omite; como máximo 3 resultados; las restricciones se filtran en el server; timeout de 12 s y resultados "tarde" marcados con `late: true`.

---

## 7. Features

| # | Feature | Estado |
|---|---|---|
| 1 | GPS simulado con joystick + mapa | ✅ |
| 2 | Onboarding (por voz) y edición de gustos | ✅ (restricciones: solo por voz, ver pendientes) |
| 3 | Itinerario manual | ✅ |
| 4 | ¿Qué hago? — voz con tools | ✅ |
| 5 | ¿Qué estoy viendo? — foto | ✅ |
| 6 | Traducción con residentes | ✅ (también en iPhone) |
| 7 | Avisos proactivos por cercanía | ✅ en pantalla y push · ⏳ en voz (A-6) |
| 8 | Itinerario creado por el agente (`plan_day`) | ⏳ |
| 8b | Google Calendar | ⏳ |
| 9 | Video en vivo | ⏳ (la foto cubre el caso) |
| 10 | Viaje compartido | ✅ |

**Carriles:** Dev A = agente y voz (Tiago). Dev B = app y UX (Nico). Dev C = datos y backend (Lucas).

---

## 8. Tareas

### Dev A — Agente y voz

- [x] **A-1** Tools en la sesión, `ResponseQueue`, `recommend_nearby`.
- [x] **A-1b** Tools en segundo plano: "dejame buscar", timeout de 12 s, `late: true`.
- [x] **A-2** Contexto ampliado (sección 5).
- [x] **A-3** `edit_itinerary`, `remember`, `get_place` y `session.update` al moverse o cambiar datos.
- [x] **A-3b** `search_places` y `search_events`.
- [x] **A-3d** `web_search` con la web oficial y menús.
- [x] **A-3e** `place_facts`, `show_route` (con aviso al llegar), `show_phrase`, `where_am_i`, `open_translator`, `translation_transcript`.
- [x] **A-4** La foto entra a la sesión. Ahora en tres momentos, cada uno pidiendo que hable: al sacarla ("estoy mirando la foto"), al reconocerla (cuenta qué es y ofrece más) y si no se reconoce (pide otra).
- [x] **B-4** Cámara (hecha por A; pantalla completa por C). Reconoce lugares, obras y cosas.
- [x] **A-5** Traductor: hook, rutas, extracción de recomendaciones por turno, resumen de la charla para el agente, voz de ElevenLabs.
- [ ] **A-3c** `add_to_calendar` (depende de C-8).
- [ ] **A-6** Avisos en voz: si llega un aviso con la llamada abierta, que el agente lo diga (`note(reason, { respond: true })`).
- [ ] **A-7** Tool `plan_day` sobre el planner (C-7).
- [ ] **A-8** Video en vivo (caro: medir antes).

### Dev B — App y UX

- [x] **B-1** Mapa y GPS simulado, salto a cualquier ciudad, joystick en `/talk`.
- [x] **B-2** Onboarding por voz y gustos editables en el perfil (también propios).
- [x] **B-3** Itinerario editable en la home, con Realtime.
- [x] **B-5** UI del traductor (hecha por C): idiomas, "¿Cómo se usa?" que se puede ocultar, burbujas de cada lado, Mostrar a pantalla completa, cards de recomendaciones solo durante la charla.
- [x] **B-6** Avisos (hecho por C): banner en todas las pantallas y Web Push.
- [x] Home nueva con mapa y barra de pestañas, blob de voz con transición a `/talk`, nivel del mic.
- [ ] **B-2b** Editar restricciones (dieta, movilidad, presupuesto, ritmo) desde el perfil: hoy se ven pero solo cambian por voz o en el onboarding.
- [ ] **B-7** Panel de demo: forzar aviso, ver el contexto del agente, reiniciar demo.
- [ ] **B-8** "Conectar Google Calendar" (depende de C-8).

### Dev C — Datos y backend

- [x] **C-1** Migración, pings y ubicación en vivo en el contexto.
- [x] **C-2** Funciones de itinerario y perfil con deshacer.
- [x] **C-3** Visión con Jev y respaldo LLM (batería de 10 casos).
- [x] **C-5** Extracción de recomendaciones (hecha por A en vivo; C sumó guardar, descartar y agendar).
- [x] **C-6** Motor de avisos por cercanía (reglas + Jev), umbrales en `src/lib/tuning.ts`.
- [x] **C-9** Google Places (New).
- [ ] **C-4** Datos de la demo: verificar que la charla de la demo ancle la crêperie correcta y que la caminata pase cerca.
- [ ] **C-7** Planner (salida estructurada, solo lugares de `places`, respeta reservas, snapshot antes de escribir).
- [ ] **C-8** Google Calendar (OAuth, eventos como reservas, crear eventos).

### Viaje compartido (Dev A)

- [x] **L-1** Varias personas en el mismo viaje, cada una con su llamada. Probado con dos llamadas a la vez.
- [ ] **L-2** Si `/join/<código>` se abre sin sesión, el código se pierde al pasar por el login.

---

## 9. Próximos pasos sugeridos

**Para revisar antes de la demo**
1. **Que el equipo resetee la base** (`npx supabase db reset`): hubo migraciones nuevas y el seed cambió de cuentas (Sofía/Mateo/Lucía → Tiago/Lucas/Nicolas). Con la base vieja el agente saluda con el nombre viejo.
2. **Ensayar la demo en el iPhone** de punta a punta, con el guion de la sección 10 y la cuenta Nicolas. Es donde aparecen las fallas que el navegador de la laptop no muestra (como el mic mudo del traductor).
3. **Horarios ya pasados:** el agente suma actividades a una hora que ya pasó, y "Agendar" de las cards ofrece horarios de madrugada. Ofrecer solo horarios de hoy en adelante y dentro del día.
4. **Variante del español en el traductor:** a veces sale español de España ("os gusta"). Probar pedirlo en las instrucciones de la sesión de traducción.
5. **El original del traductor pierde la última palabra** (la traducción sale completa). Es cosmético.
6. **Costo:** mirar en el medidor cuánto sale una demo completa (voz + traductor + visión + UI generativa) y dejarlo anotado.

**Cosas nuevas simples**
1. **A-6, avisos en voz** (chico): con la llamada abierta, el aviso de cercanía entra con `note(…, { respond: true })` y el agente lo dice. Ya está todo lo demás.
2. **Editar restricciones en el perfil** (B-2b): los mismos selectores que el onboarding.
3. **"Repetir" en las burbujas del traductor**: volver a escuchar una traducción (ya está la voz de ElevenLabs).
4. **Historial de fotos**: lo que reconociste hoy, con "Al plan", en la pestaña Viaje.
5. **Recomendaciones guardadas en la pestaña Viaje**: la lista de lo que te recomendaron, con Llevame y Descartar (hoy solo se ven durante la charla y en los avisos).
6. **L-2**: guardar el código de invitación antes de mandar al login.

---

## 10. Guion de demo (3 minutos)

Con la cuenta de **Nicolas**, en el iPhone.

| Tiempo | Momento | Feature |
|---|---|---|
| 0:00 | Home: mapa, gustos e itinerario de hoy | Perfil |
| 0:20 | Joystick: caminamos del Pompidou hacia el Marais | GPS |
| 0:35 | "Tengo una hora antes de la clase de cocina, ¿qué hago?" → Marché des Enfants Rouges → "agregalo" → aparece en el plan | Voz + itinerario |
| 1:05 | Foto de Place des Vosges → "estoy mirando la foto" → cuenta qué es → "contame más" | Cámara |
| 1:35 | "¿Cómo le pregunto a alguien…?" → abre el traductor → charla con una residente → card "te lo recomendó Camille" | Traducción |
| 2:10 | Pasamos cerca → aviso con el nombre de Camille (banner o push) | Proactivo |
| 2:35 | "Llevame" → ruta a pie → al llegar el agente lo dice | Ruta |
| 2:50 | Cierre: viaje compartido o lo que sabe el agente del viaje | Cierre |

---

## 11. Herramientas de desarrollo

- **Probar en el celular:** un solo túnel ngrok, Supabase pasa por `/supabase/*` (README, "Probar en el celular"). En iPhone, push solo como PWA agregada a la pantalla de inicio.
- **Sin micrófono** (el navegador integrado del editor lo bloquea), solo en desarrollo:
  - `window.rumboSay("¿qué hago?")` le habla al agente por texto.
  - `window.rumboTranslatorTalk("me" | "them", "texto")` hace un turno real del traductor: lo dice con TTS por un mic de mentira y pasa por la traducción de verdad. `rumboDevMicOff()` vuelve al mic real.
  - `window.rumboTranslatorSay("them", original, traducción)` simula un turno sin traducir.
- **Pruebas con APIs reales** (opt-in): `npm run test:vision`, `test:relevance`, `test:proximity`.
- **Umbrales** de visión y avisos: `src/lib/tuning.ts`, cada uno se pisa con una variable de entorno.

---

## 12. Trampas conocidas

- **Next.js 16:** leer la documentación local antes de usar cualquier API de Next.
- **zod 4 + tools:** `.optional()` hace que el tool falle en silencio; usar `.nullable()`.
- **Nunca mandar `response.create` directo** con la llamada abierta: todo pasa por `ResponseQueue` (`note(…, { respond: true })` o `queue.request()`).
- **Supabase Realtime con RLS:** `realtime.setAuth` antes de suscribirse (`onTableChange` en `src/lib/supabase/client.ts`).
- **Server actions en serie:** para trabajo lento o en paralelo, route handler.
- **iPhone: un `<audio>` que suena con el mic abierto deja el mic mandando silencio** (vivo y sin mute, pero en 0). Todo audio que suene mientras se graba va por Web Audio (`VoiceQueue`), con el `AudioContext` destrabado en el toque del botón.
- **Traductor:** el modelo se guarda el final de la traducción mientras hay silencio y lo manda recién después de `session.close`; por eso se cierra 1,5 s después de soltar y se sigue escuchando hasta que deja de mandar. No acepta `transcription.language`: el idioma no se puede forzar.
- **Chrome no reenvía audio remoto directo a otra conexión WebRTC** (manda silencio): pasarlo por Web Audio.
- **Nombres propios deformados** por la traducción: anclar con búsqueda tolerante.
- **El navegador integrado del editor bloquea micrófono, cámara y notificaciones:** usar los helpers de la sección 11 o Chrome.
- **Costo:** el traductor se cobra por minuto abierto; el video sería lo más caro.
- **iCloud:** no trabajar en carpetas con "Optimizar almacenamiento" (vacía archivos de `.git` y `.env.local`).
- **Componentes reutilizables:** `Section`/`GroupedList`, `CategoryIcon`, `NotificationCard`/`PlaceNotification`, `ScrollFade`, el blob de voz. Usarlos antes de crear algo nuevo.
