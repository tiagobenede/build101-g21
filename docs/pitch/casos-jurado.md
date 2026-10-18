# Casos del jurado

La consigna dice que el jurado puede variar un caso dentro del alcance que declaramos. Esta es la lista para ensayar antes de presentar. Cada caso dice qué tiene que pasar; si falla, anotalo al lado.

**Alcance que declaramos:** un viajero camina por una ciudad con la ubicación simulada. Le habla a Polo, traduce charlas con residentes y recibe avisos. Funciona en cualquier ciudad donde Google tenga lugares.

## Guion de la demo (3 minutos)

Dos cuentas, una por ciudad. Cada una arranca sola en su lugar al entrar (`src/lib/demo-accounts.ts`):

- **Nicolas** (comida, mercados, parques): Union Square, Nueva York. Escenas 1 y 2.
- **Lucas** (gusto: "louvre"): sobre el Pont des Arts, a ~184 m del Louvre, París. Escenas 3 a 5.

**Hora:** en el mapa, Hora → Simulada. Con el pin en Nueva York, 10:30 (= 16:30 en París). La hora simulada vale para todo el navegador, así que al pasar a Lucas en París ya son las 16:30. Si la demo se hace en vivo de mañana en Argentina, también sirve la hora real.

### Escena 1 — Nueva York: el local que no ayuda (~40 s, Nicolas)

| Hacen | Tiene que pasar |
|---|---|
| Abren el traductor y le preguntan a un local "¿Qué lugar de bagels me recomendás?" | El traductor lo dice en inglés |
| El local contesta "Go fuck yourself" | La transcripción lo muestra traducido, sin suavizar |
| Le preguntan a Polo "¿Qué me quiso decir?" | Polo lee la charla del traductor y lo explica con humor |

### Escena 2 — Nueva York: Polo resuelve (~40 s, Nicolas)

| Hacen | Tiene que pasar |
|---|---|
| "Buscame buenos bagels acá cerca" | Tarjetas de bagelerías abiertas a las 10:00, con minutos de caminata |
| Eligen uno: "Llevame" | Pasa al mapa con la ruta |

### Escena 3 — París: aviso por gustos (~20 s, Lucas)

"Unos días después…". Entran como Lucas: está sobre el Pont des Arts, a ~184 m del Louvre.

| Hacen | Tiene que pasar |
|---|---|
| Empujan el joystick (20x) derecho hacia arriba (norte) ~4 s | En ~5 s salta *"Estás a 1 min de Museo del Louvre, va con lo que te gusta (louvre)."* Es por sus gustos, no por el plan |

### Escena 4 — París: la Gioconda (~40 s, Lucas)

| Hacen | Tiene que pasar |
|---|---|
| Sacan foto a la Gioconda (foto ya cargada) | La reconoce como obra |
| "¿Qué tiene de especial?" | Cuenta datos de la obra |

### Escena 5 — París: hora y media libre, de camino al plan (~30 s, Lucas)

Saliendo del Louvre. En el plan de hoy tiene **"Encuentro con amigos en el Jardin du Luxembourg" a las 19:30**, a ~22 min a pie.

| Hacen | Tiene que pasar |
|---|---|
| "Tengo una hora y media libre, ¿qué puedo hacer acá cerca?" | Algo de sus gustos que le quede de camino al Luxembourg (o un evento que empiece pronto). Dice cuánto camina, cuánto puede quedarse y cuánto camina después hasta el Luxembourg. No propone el Orsay ni el Pompidou, que quedan para el otro lado |

Cierre: frase final o slide (~10 s). Total: ~3:00, sin margen; si hay que cortar, se acorta la escena 1.

### Antes de presentar

- Antes de cada ensayo: Perfil → **Reiniciar demo** (deja todas las cuentas como el seed, con el plan de Lucas para hoy a las 19:30 de París) y entrar por el login. Si en cambio se recarga la base con `supabase db reset`, reiniciar la app después: el servidor recuerda en memoria qué zonas ya pidió a Google.
- El Louvre no está en el plan de Lucas (se sacó del seed), así el aviso sale solo por gustos y no menciona el plan.
- Lucas arranca en el Pont des Arts (48.85895, 2.3376) y tiene solo el gusto "louvre". Medido caminando al norte, a las 16:35 en París: el aviso salió 3 de 3 (confianza 0.66, 0.70, 0.76; el mínimo es 0.6) y en el browser apareció a los 4,6 s de empezar a caminar. Con "arte", "historia" y "libros" además salió 1 de 3, y por la Rue de Rivoli le ganaba el aviso de una galería. Con el Luxembourg a las 18:00 Jev dudaba (no le da el tiempo), por eso es a las 19:30.
- Escena 5 con solo "louvre": Polo recomienda lugares que coincidan con sus gustos. Para que proponga arte o historia, que Lucas se lo diga antes en la charla ("me encanta el arte y la historia"): Polo lo guarda y lo usa.
- Borrar los avisos de la cuenta de Lucas: cada lugar avisa una sola vez y entre avisos hay 60 s de pausa.
- Probar que el modelo y la voz no suavicen el insulto.
- Probar la foto exacta de la Gioconda.

## 1. Preguntas abiertas en París (cuenta Lucía)

| Le dicen | Tiene que pasar |
|---|---|
| "Tengo una hora, ¿qué hago?" | Un lugar abierto, a pie, de sus gustos, con minutos de caminata y de visita |
| "Quiero comer algo rápido cerca" | Comida a 10 minutos o menos |
| "¿Hay algo para hacer esta noche?" | Un evento real de la agenda de París, con la hora |
| "¿Qué es eso?" (con una foto de un edificio) | Reconoce el lugar y cuenta un dato |
| "Soy vegetariana" y después "¿dónde como?" | La recomendación respeta lo que dijo |
| "Llevame" | Pasa al mapa con la caminata |
| "Sacá el museo de mañana" | Edita el plan y lo confirma |
| Interrumpirlo mientras habla | Se calla y escucha |

## 2. Otra ciudad: Montevideo (o la que elija el jurado)

Mover la ubicación con el buscador, por ejemplo a "Plaza Independencia, Montevideo".

| Le dicen | Tiene que pasar |
|---|---|
| "¿Dónde estoy?" | Dice la calle o el lugar en Montevideo |
| "¿Qué hora es?" | Hora de Montevideo, no la de París |
| "Tengo una hora, ¿qué hago?" | Lugares de Montevideo a pie |
| "¿Hay algo para hacer esta noche?" | No dice "solo tengo la agenda de París"; busca en la web |
| "¿Qué tiene de menú el [lugar de la pantalla]?" | Busca resultados de Uruguay |
| "¿Cómo pido un café?" | No ofrece el traductor: acá se habla castellano |
| La home | No muestra el plan de París a horas raras |
| Foto del Palacio Salvo | No lo confunde con algo de París |

## 3. Cosas que pueden salir mal en la sala

- **Ruido:** probar con auriculares y con el micrófono a 30 cm.
- **Wifi:** tener el hotspot del celular listo.
- **Residente que habla francés:** si no está, que alguien del jurado hable en inglés. El traductor lo detecta.
- **Respaldo:** si la voz no responde en 5 segundos, pasar a la diapositiva animada de la historia.

## Lo que arreglamos para la prueba en otra ciudad

- `web_search` busca en el país donde está el viajero, no en el del viaje.
- `search_events` fuera de París le pide al agente que busque en la web sin decirlo.
- El agente sabe el idioma local. En un país de habla castellana no ofrece el traductor.
- La cámara le pasa al modelo la ciudad real.
- El plan oculta lo que está a más de 100 km, así el plan de París no aparece en Montevideo.
