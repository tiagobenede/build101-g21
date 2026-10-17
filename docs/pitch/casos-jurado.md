# Casos del jurado

La consigna dice que el jurado puede variar un caso dentro del alcance que declaramos. Esta es la lista para ensayar antes de presentar. Cada caso dice qué tiene que pasar; si falla, anotalo al lado.

**Alcance que declaramos:** un viajero camina por una ciudad con la ubicación simulada. Le habla a Polo, traduce charlas con residentes y recibe avisos. Funciona en cualquier ciudad donde Google tenga lugares.

## Guion de la demo (3 minutos)

Dos cuentas, una por ciudad. Cada una arranca sola en su lugar al entrar (`src/lib/demo-accounts.ts`):

- **Nicolas** (comida, mercados, parques): Union Square, Nueva York. Escenas 1 y 2.
- **Lucas** (arte, historia, libros): llegando al Louvre por la Pirámide, París. Escenas 3 a 5.

**Hora:** en el mapa, Hora → Simulada. Con el pin en Nueva York, 10:00 (= 16:00 en París). La hora simulada vale para todo el navegador, así que al pasar a Lucas en París ya son las 16:00. Si la demo se hace en vivo de mañana en Argentina, también sirve la hora real.

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

"Unos días después…". Entran como Lucas: está llegando al Louvre por la Pirámide.

| Hacen | Tiene que pasar |
|---|---|
| Nada: esperan 5–10 s | Salta el aviso solo por su gusto por el arte, no por el plan |

### Escena 4 — París: la Gioconda (~40 s, Lucas)

| Hacen | Tiene que pasar |
|---|---|
| Sacan foto a la Gioconda (foto ya cargada) | La reconoce como obra |
| "¿Qué tiene de especial?" | Cuenta datos de la obra |

### Escena 5 — París: hora y media libre, de camino al plan (~30 s, Lucas)

Saliendo del Louvre. En el plan de hoy tiene **"Encuentro con amigos en el Jardin du Luxembourg" a las 18:00**, a ~22 min a pie.

| Hacen | Tiene que pasar |
|---|---|
| "Tengo una hora y media libre, ¿qué puedo hacer acá cerca?" | Algo de sus gustos que le quede de camino al Luxembourg (o un evento que empiece pronto). Dice cuánto camina, cuánto puede quedarse y cuánto camina después hasta el Luxembourg. No propone el Orsay ni el Pompidou, que quedan para el otro lado |

Cierre: frase final o slide (~10 s). Total: ~3:00, sin margen; si hay que cortar, se acorta la escena 1.

### Antes de presentar

- Cargar el seed el mismo día de la demo (el plan de Lucas es "hoy a las 18:00" en París). En una base ya cargada, sumar la actividad a mano.
- El Louvre no está en el plan de Lucas (se sacó del seed), así el aviso sale solo por gustos y no menciona el plan.
- Lucas arranca en la Pirámide (48.86105, 2.33698), a ~70 m del museo, y no en el museo: parado en el museo Jev duda de avisarle (confianza 0.46 a 0.64, el mínimo es 0.6). Medido a las 15:30 en París: Pirámide 0.85 y 0.85; 60 m al oeste 0.91 y 0.89; 60 m al sur (el quai) no avisa, gana la Galerie des Antiquités. No mover a Lucas antes del aviso.
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
