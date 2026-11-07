# Protocolo de GameConsole (v1)

Acuerdos entre la consola, los juegos, el registry, Prolog y GameStats. Si algo de aquí cambia, se cambia primero este documento y después el código.

**Estado:** v1, revisado por Danny y Dylan y probado contra GameStats `v1.0` (7-nov).

## Contenido

1. [Piezas y rutas](#1-piezas-y-rutas)
2. [Manifiesto de un juego (`game.json`)](#2-manifiesto-de-un-juego-gamejson)
3. [Registry: descubrimiento automático](#3-registry-descubrimiento-automático)
4. [Protocolo consola ↔ juego](#4-protocolo-consola--juego)
5. [Eventos hacia GameStats](#5-eventos-hacia-gamestats)
6. [EventSender](#6-eventsender)
7. [IA en Prolog](#7-ia-en-prolog)
8. [Estadísticas para el panel](#8-estadísticas-para-el-panel)
9. [SDK: lo que implementa cada juego](#9-sdk-lo-que-implementa-cada-juego)
10. [Pendientes](#10-pendientes)

---

## 1. Piezas y rutas

Todo entra por **nginx**, en un solo origen. Así se evita CORS y el mismo `docker-compose` funciona en una PC, detrás del túnel o en un servidor. **Nunca se escribe `localhost` en el código: siempre rutas relativas.**

| Ruta pública | Va a (ruta interna) | Qué es |
|---|---|---|
| `/` | `console:8080/` | La consola |
| `/games/{id}/...` | `game-{id}:8080/games/{id}/...` (**sin quitar el prefijo**) | La app de cada juego (por ejemplo, `/games/connect4/`) |
| `/api/registry/...` | `registry:8080/...` | Descubrimiento de juegos |
| `/api/events` | `ingestion:8080/events` | Envío de eventos |
| `/api/matches` | `ingestion:8080/matches` | Estado de las partidas (ya existe) |
| `/api/games` | `ingestion:8080/games` | Partidas en curso por juego (nuevo en v1.1) |
| `/api/stats/...` | `analytics:8081/stats/...` | Estadísticas (nuevo en v1.1) |
| `/api/results...`, `/api/players/...` | `analytics:8081/results...`, `/players/...` | Resultados (ya existen) |
| `/api/ai/...` | `prolog:8080/...` | IA |

### Juegos dinámicos

La ruta `/games/{id}/` se resuelve con una regla genérica que usa el DNS interno de Docker:

```nginx
resolver 127.0.0.11 valid=10s;                       # DNS de Docker
location ~ ^/games/(?<gid>[a-z0-9-]+)/ {
    proxy_pass http://game-$gid:8080;                # con variable y sin URI: pasa la ruta completa
}
```

- **Cada juego corre en un contenedor llamado `game-{id}`** y escucha en el puerto `8080`. Si se agrega un juego nuevo, nginx no cambia.
- Como `proxy_pass` lleva una variable, nginx **no quita el prefijo**: el juego recibe `/games/{id}/...`. Por eso **cada juego se sirve bajo `/games/{id}/`**:
  - en Vite, `base: '/games/{id}/'`;
  - el servidor del SDK (`sdk/server`) sirve los archivos bajo ese prefijo, que lee de la variable `GAME_BASE` (por defecto `/games/{id}/`).

### APIs (prefijo fijo)

nginx cambia el prefijo `/api/...` por la ruta interna de cada servicio, así GameStats no tiene que saber nada de `/api`. Como todo usa variables (para que nginx arranque aunque falte un servicio y siga a un contenedor que cambió de IP), el prefijo se cambia con `rewrite`. Archivo completo: [`gateway/default.conf`](../gateway/default.conf).

```nginx
location = /api/events  { set $up ingestion:8080; rewrite ^ /events break; proxy_pass http://$up; }
location /api/stats/    { set $up analytics:8081; rewrite ^/api(/.*)$ $1 break; proxy_pass http://$up; }
location /api/registry/ { set $up registry:8080;  rewrite ^/api/registry(/.*)$ $1 break; proxy_pass http://$up; }
location /api/ai/       { set $up prolog:8080;    rewrite ^/api/ai(/.*)$ $1 break; proxy_pass http://$up; }
# … igual para /api/matches, /api/games, /api/results, /api/players/
location /              { set $up console:8080;   proxy_pass http://$up; }
```

- Si la consola o un juego no están corriendo, el gateway responde una página de aviso (`503`) en vez de caerse.
- Solo el gateway se publica en la PC (puerto `8000` por defecto, variable `GATEWAY_PORT`). Ver [`docker-compose.yml`](../docker-compose.yml).

---

## 2. Manifiesto de un juego (`game.json`)

Cada juego publica su ficha en `/games/{id}/game.json` y la manda al registry al arrancar.

```json
{
  "id": "connect4",
  "name": "4 en línea",
  "version": "1.0.0",
  "description": "Conecta cuatro fichas antes que tu rival.",
  "gameStatsId": "connect4",
  "gameVersion": "1.0",
  "entry": "/games/connect4/",
  "icon": "/games/connect4/icon.png",
  "players": { "min": 1, "max": 2 },
  "modes": ["vs-cpu", "local-2p"],
  "options": [
    { "key": "difficulty", "label": "Dificultad", "type": "select",
      "values": ["easy", "medium", "hard"], "default": "medium", "modes": ["vs-cpu"] }
  ],
  "protocol": "gameconsole/1"
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `id` | sí | Identificador único: minúsculas, números y guiones. Es el nombre del contenedor (`game-{id}`) |
| `name`, `description`, `icon` | `name` sí | Lo que muestra el menú |
| `version` | sí | Versión de la app del juego |
| `gameStatsId` | sí | El `gameId` que usa en GameStats (`connect4`, `tetris`, `fighting`) |
| `gameVersion` | sí | El `gameVersion` que va en cada evento |
| `entry` | sí | URL relativa que la consola abre en el iframe |
| `players` | sí | Mínimo y máximo de jugadores humanos |
| `modes` | sí | `solo`, `vs-cpu` o `local-2p` (2 personas en el mismo dispositivo) |
| `options` | no | Opciones que la consola le pregunta al jugador antes de empezar. La consola las muestra sin saber qué significan |
| `protocol` | sí | Versión del protocolo que entiende: `gameconsole/1` |

Los tres juegos:

| `id` | `modes` | `players` | `options` |
|---|---|---|---|
| `connect4` | `vs-cpu`, `local-2p` | 1–2 | `difficulty` (solo en `vs-cpu`) |
| `tetris` | `solo` | 1 | `startLevel` (1–15) |
| `fighting` | `local-2p` | 2 | `rounds` (1, 3 o 5) |

---

## 3. Registry: descubrimiento automático

Cada juego **se registra solo** cuando su contenedor arranca y después **manda un latido**. Si deja de latir, el registry lo saca de la lista. La consola nunca conoce la lista de juegos de antemano.

| Método | Ruta | Quién lo llama | Qué hace |
|---|---|---|---|
| `POST` | `/api/registry/games` | El juego, al arrancar | Cuerpo: el manifiesto. Lo registra (o lo actualiza). Responde `201` |
| `PUT` | `/api/registry/games/{id}/heartbeat` | El juego, **cada 5 s** | "Sigo vivo". `404` si no está registrado: el juego vuelve a registrarse |
| `DELETE` | `/api/registry/games/{id}` | El juego, al apagarse | Se va de la lista enseguida |
| `GET` | `/api/registry/games` | La consola | Lista de juegos vivos: `[{ ...manifiesto, "registeredAt", "lastSeen" }]` |
| `GET` | `/api/registry/health` | Docker | `{"status":"ok"}` |

- Un juego que pasa **15 s sin latido** se considera caído y no aparece en el `GET`.
- El registry valida el manifiesto: campos obligatorios, `id` válido y `protocol` conocido. Un manifiesto inválido devuelve `400` con el motivo.
- Dentro de Docker, los juegos llaman al registry directo, sin pasar por nginx: `http://registry:8080/games`, `/games/{id}/heartbeat`, etc. (las mismas rutas, sin el prefijo `/api/registry`). La URL se configura con la variable `REGISTRY_URL`.
- La consola vuelve a pedir la lista **cada 10 s**, así un juego que aparece o desaparece se nota sin recargar la página.
- **Implementación:** Node + TypeScript con `node:http`, sin framework, igual que el resto del proyecto.

---

## 4. Protocolo consola ↔ juego

La consola abre cada partida en un `<iframe src="{entry}?matchId=...">`. Se comunican con `window.postMessage`. **Cada iframe es una partida.**

### Formato de todos los mensajes

```json
{ "protocol": "gameconsole/1", "type": "INIT", "matchId": "connect4-3f9c2a1e", "payload": { } }
```

- `matchId` va siempre. Así, si llega un mensaje de otro iframe, se descarta.
- Los dos lados verifican `event.origin === window.location.origin` y **ignoran** los mensajes con otro `protocol` o un `type` desconocido.

### Consola → juego

| `type` | `payload` | Qué hace el juego |
|---|---|---|
| `INIT` | `{ gameId, matchId, mode, players, options }` | Prepara la partida y responde `READY` |
| `START` | `{}` | Empieza: emite `MATCH_STARTED` y `PLAYER_JOINED` (ver sección 5) |
| `PAUSE` | `{ reason: "user" \| "hidden" }` | Detiene el reloj, deja de aceptar teclas y emite `MATCH_PAUSED` con ese `reason` |
| `RESUME` | `{}` | Sigue y emite `MATCH_RESUMED` |
| `STOP` | `{ reason: "user" \| "closed" }` | Termina. Si la partida ya empezó, emite `PLAYER_LEFT` y `MATCH_FINISHED`; después manda `FINISHED` |

`players` es una lista de `{ "playerId": "danny", "name": "Danny", "kind": "human" \| "cpu", "slot": 1 }`. El `slot` dice qué lugar ocupa cada uno: en connect4, el slot 1 juega con rojo; en fighting, el slot 1 es el de la izquierda y usa WASD. **Los `playerId` de una partida son siempre distintos**: en `local-2p` la consola no deja empezar si los dos jugadores tienen el mismo nombre.

### Juego → consola

| `type` | `payload` | Cuándo |
|---|---|---|
| `READY` | `{}` | Después de `INIT`, cuando ya cargó |
| `STATE` | `{ state }` | Cada vez que cambia el estado (ver abajo) |
| `GAME_EVENT` | `{ event }` | Cada evento para GameStats, **ya completo** (sección 5) |
| `FINISHED` | `{ winner: playerId \| null, reason: "normal" \| "stopped" }` | Al terminar, **después** de emitir `MATCH_FINISHED` |
| `ERROR` | `{ message, fatal }` | Algo falló. Si `fatal`, la consola cierra la partida |

### Estados de una partida (patrón State)

```
loading ──READY──► ready ──START──► playing ◄──RESUME── paused
                     │                │  └──PAUSE──────────►┘ │
                     │                └──(fin o STOP)──┐       │
                     └──STOP──────────────────────────►finished◄──STOP
```

| Mensaje | Válido en | Si llega en otro estado |
|---|---|---|
| `START` | `ready` | Se ignora |
| `PAUSE` | `playing` | Se ignora |
| `RESUME` | `paused` | Se ignora |
| `STOP` | `ready`, `playing`, `paused` | Se ignora (en `loading` la consola simplemente quita el iframe) |

- **`STOP` desde `ready`:** la partida nunca empezó, así que el juego **no emite eventos**; solo manda `FINISHED` con `winner: null`.
- Si no llega `READY` en **10 s**, la consola marca la partida como error y la cierra.
- Si después de `STOP` no llega `FINISHED` en **2 s**, la consola cierra la partida por su cuenta (ver "Cierre de respaldo").

### Partidas ocultas

Si una partida deja de verse (la pestaña del navegador pasa a segundo plano, o la consola minimiza o tapa ese iframe), la consola le manda **`PAUSE` con `reason: "hidden"`**. Así un Tetris o una pelea no siguen corriendo sin que nadie juegue.

- La consola **no reanuda sola**: cuando la partida vuelve a verse, muestra un botón "Reanudar" y manda `RESUME` cuando el jugador lo pulsa.
- Las partidas que están a la vista al mismo tiempo (por ejemplo, en una cuadrícula) siguen corriendo en paralelo.

### Secuencia normal

```
consola                                  juego
  │── INIT ────────────────────────────►│
  │◄──────────────────────────── READY ─│
  │── START ───────────────────────────►│
  │◄── GAME_EVENT (MATCH_STARTED) ──────│
  │◄── GAME_EVENT (PLAYER_JOINED) ×N ───│
  │◄── GAME_EVENT (PLAYER_ACTION) … ────│
  │◄── GAME_EVENT (MATCH_FINISHED) ─────│
  │◄─────────────────────────FINISHED ──│
```

---

## 5. Eventos hacia GameStats

Se usa el **contrato de GameStats tal como está** (`gamestats/contracts/event.schema.json` y las validaciones de contexto en `gamestats/contracts/README.md`). Los eventos tienen que pasar esas reglas o Scala los descarta.

### Quién llena cada campo

| Campo | Lo llena | Cómo |
|---|---|---|
| `eventId` | SDK | `{matchId}-e{n}`, con `n` = 1, 2, 3… por partida |
| `timestamp` | SDK | `new Date().toISOString()` (RFC 3339) |
| `gameId` | SDK | `gameStatsId` del manifiesto |
| `gameVersion` | SDK | `gameVersion` del manifiesto |
| `matchId` | SDK | El que mandó la consola en `INIT` |
| `type`, `action`, `playerId`, `data` | **El juego** | Con su adapter (sección 9) |

### Identificadores

- **`matchId`** = `{gameId}-{uuid}` (por ejemplo, `connect4-3f9c2a1e-...`). Lo crea la consola con `crypto.randomUUID()`. Es único aunque haya muchas partidas a la vez o en varias pestañas.
- **`playerId`** = el nombre que escribe el jugador, en minúsculas y sin espacios (`"Danny G"` → `danny-g`). La computadora es siempre `cpu`.
- **Nombres repetidos:** la consola consulta `/api/players/{playerId}`. Si el nombre ya existe, pregunta "¿eres tú?". Si la persona dice que no, le pide otro nombre.

### Eventos obligatorios en cada partida

1. `MATCH_STARTED`, con los `data` que exige el juego: fighting `{stage, rounds}`, tetris `{startLevel}`.
2. `PLAYER_JOINED` por cada jugador: connect4 `{color, bot?, difficulty?}`, fighting `{character}`.
3. Los `PLAYER_ACTION` del juego.
4. `MATCH_FINISHED`, **una sola vez**. Después de este evento GameStats rechaza cualquier otro.

### Nada de eventos por frame

Los eventos describen **hechos del juego**, no el dibujo. **Nunca se emite un evento dentro del ciclo de dibujo** (60 veces por segundo).

| Juego | Se emite | No se emite |
|---|---|---|
| Tetris | Cada acción del jugador (mover, rotar, bajar, `HOLD`), pieza colocada, líneas, nivel | La caída automática de la pieza en cada paso |
| Fighting | Cada golpe, bloqueo, combo, derribo, round | La posición de los personajes mientras se mueven |
| 4 en línea | Cada ficha, amenaza, deshacer, pista | — |

### Cierre de respaldo (lo hace la consola)

**Solo aplica si la partida llegó a emitir `MATCH_STARTED`.** Si nunca empezó, no hay nada que cerrar en GameStats.

Si la partida se cierra y el juego no alcanzó a mandar `MATCH_FINISHED` (pestaña cerrada, juego colgado, `STOP` sin respuesta), **la consola** manda:

- un `PLAYER_LEFT` por cada jugador humano,
- y un `MATCH_FINISHED` sin `data`.

Se puede porque en fighting, connect4 y tetris esos dos eventos no exigen `data`. La consola sabe si ya pasó un `MATCH_FINISHED` por esa partida, así que **nunca lo manda dos veces**.

### Decisiones de la IA

Se mandan como **datos extra** en el `DISC_DROPPED` de la computadora. El contrato no prohíbe campos adicionales en `data`:

```json
{ "type": "PLAYER_ACTION", "action": "DISC_DROPPED", "playerId": "cpu",
  "data": { "column": 4, "row": 2,
            "ai": { "engine": "prolog-minimax", "depth": 6, "score": 12, "nodes": 4821, "ms": 85 } } }
```

> ✅ Probado contra GameStats `v1.0`: Scala ignora el campo `ai` y no descarta el evento (sección 10).

---

## 6. EventSender

Vive en la consola. Hay **una cola por partida**, así una partida no frena a otra.

- **Lotes:** manda `POST /api/events` con un arreglo cada **500 ms** o cuando junta **20 eventos**, lo que pase primero. Go acepta arreglos.
- **Orden:** dentro de una partida, en el orden en que se generaron. Nunca hay dos envíos de la misma partida a la vez.
- **Reintentos** (patrón Strategy): si hay error de red o una respuesta `5xx`, reintenta a los 1, 2, 4 y 8 s, y después cada 8 s. Los eventos quedan en la cola, no se pierden.
- **Respuesta `4xx`** de un evento: no se reintenta, se registra en la consola del navegador con el motivo que devuelve Go.
- **Al cerrar la pestaña** (`pagehide`): manda lo pendiente y el cierre de respaldo con `navigator.sendBeacon('/api/events', ...)`, que el navegador entrega aunque la página se esté cerrando.
- **Observer:** el EventSender se suscribe al bus de eventos de la consola. No lo llama nadie directamente.

---

## 7. IA en Prolog

`POST /api/ai/connect4/move`

```json
{ "board": [["red"], [], ["yellow", "red"], ["yellow"], [], [], []],
  "player": "yellow",
  "difficulty": "hard" }
```

- `board`: **7 columnas**, de la 1 a la 7. Cada una es la lista de fichas **de abajo hacia arriba** (máximo 6). Así es como piensa Prolog: soltar una ficha es agregarla al final de su columna.
- `player`: el color que mueve (la computadora).
- `difficulty`: `easy` = profundidad 2, `medium` = 4, `hard` = 6.

Respuesta `200`:

```json
{ "column": 4, "score": 12, "depth": 6, "nodes": 4821, "ms": 85 }
```

- `column` va de 1 a 7. `400` si el tablero es inválido o está lleno.
- Algoritmo: **minimax con poda alfa-beta**. Evalúa líneas de 2, 3 y 4 fichas y prefiere el centro.
- `GET /api/ai/health` → `{"status":"ok"}`.
- Dentro del contenedor, las rutas son sin el prefijo: `POST /connect4/move` y `GET /health` (nginx quita `/api/ai`).

---

## 8. Estadísticas para el panel

El panel **no calcula nada**: muestra lo que devuelve GameStats y vuelve a consultar **cada 3 s**. Estas son las rutas nuevas de GameStats `v1.1`. Los nombres son propuestas; los detalles los define quien implementa cada una.

| Ruta | Servicio | Devuelve |
|---|---|---|
| `GET /api/games` | Go | Por juego: partidas `inProgress` (en curso ahora) |
| `GET /api/stats/overview` | Scala | Totales: partidas terminadas por juego, jugadores distintos, patrones más frecuentes, mejores jugadores |
| `GET /api/stats/games/{gameId}` | Scala | Lo de un juego: partidas terminadas, duración promedio, victorias por jugador, promedios de sus métricas, patrones |
| `GET /api/players/{playerId}` | Scala | Ya existe |

- **Partidas por juego** = `inProgress` (de Go) + terminadas (de Scala). Las terminadas salen de Scala porque Scala las guarda en disco, mientras que Go las tiene en memoria y las pierde si se reinicia.

**Respuestas de Scala (implementadas en `gamestats`, rama `scala`):**

```jsonc
// GET /api/stats/games/connect4   (un juego sin partidas responde 200 con todo en 0)
{
  "gameId": "connect4", "matches": 3, "players": 5, "totalEvents": 109,
  "avgDurationSeconds": 134.33, "avgEventsPerMatch": 36.33, "matchesWithoutWinner": 1,
  "winners":  [{ "playerId": "ana", "wins": 2 }, { "playerId": "cpu", "wins": 1 }],
  "metrics":  { "discs": { "avg": 12, "min": 4, "max": 21 } },
  "actions":  { "DISC_DROPPED": 72, "UNDO": 2 },
  "patterns": [{ "rule": "PERFECT_DEFENSE", "count": 2 }]
}

// GET /api/stats/overview
{
  "matches": 6, "players": 5, "totalEvents": 197, "avgDurationSeconds": 106.5,
  "games": [ /* un objeto como el de arriba por cada gameId con partidas */ ],
  "topWinners":  [{ "playerId": "ana", "wins": 2 }],   // máximo 5
  "topPatterns": [{ "rule": "PERFECT_DEFENSE", "count": 2 }]
}
```

- Scala v1.1 acepta **cualquier `gameId`**: un juego sin análisis propio aparece con las estadísticas genéricas (partidas, duración, eventos, acciones), sin métricas por jugador.

---

## 9. SDK: lo que implementa cada juego

El SDK (`sdk/`) implementa este protocolo una sola vez. Cada juego solo hereda y llena los pasos.

```ts
// Template Method: el SDK maneja el protocolo y los estados; el juego llena los pasos.
export abstract class GameApp {
  protected abstract onInit(ctx: MatchContext): Promise<void>; // cargar, armar el tablero
  protected abstract onStart(): void;                          // emitir MATCH_STARTED, PLAYER_JOINED y arrancar
  protected abstract onPause(): void;
  protected abstract onResume(): void;
  protected abstract onStop(reason: StopReason): void;         // emitir PLAYER_LEFT y MATCH_FINISHED

  /** Adapter: el juego describe el hecho y el SDK completa eventId, timestamp, gameId, gameVersion y matchId. */
  protected emit(e: { type: EventType; action?: string; playerId?: string; data?: object }): void;
  /** Avisa a la consola que terminó (manda FINISHED). */
  protected finish(winner: string | null): void;
}
```

Además, el SDK trae el **servidor de cada juego** (`sdk/server`): sirve los archivos del juego en el puerto `8080` **bajo `GAME_BASE`** (`/games/{id}/`, ver sección 1), publica `game.json` y hace el registro y el latido en el registry. Cada juego lo usa sin escribir nada de esto.

Lo que le queda a cada juego:
1. Su `game.json`.
2. Su clase que hereda de `GameApp`.
3. Su lógica y su dibujo (clases propias: `Board`, `Piece`, `Fighter`…).
4. Su **adapter de eventos**: de los hechos del juego ("cayó una ficha en la columna 4") a eventos del contrato (`DISC_DROPPED {column: 4, row: 2}`).

---

## 10. Pendientes

- [x] **Juegos nuevos en GameStats — aprobado (Danny y Dylan).** `gameId` es una lista cerrada en el contrato (`racing`, `fighting`, `connect4`, `tetris`) y Go rechaza los `gameId` desconocidos. En `v1.1` GameStats acepta **cualquier `gameId`**: los juegos conocidos siguen con sus validaciones y su analizador; uno desconocido se analiza con las estadísticas genéricas de Scala (duración, eventos por acción, jugadores, ganador si lo hay).
- [x] **Pruebas contra GameStats `v1.0`** (7-nov, lotes armados desde los fixtures del contrato y enviados directo a Scala `POST /analyze`). Las 4 pasaron, todos los eventos analizados y **ningún descarte** en el log de Scala:

  | Caso | Enviados / analizados | Ganador |
  |---|---|---|
  | connect4 contra la computadora con `data.ai` en cada `DISC_DROPPED` de `cpu` | 22 / 22 | `p1` (y patrones `DOUBLE_THREAT`, `QUICK_WIN`) |
  | connect4 abandonada: `PLAYER_LEFT` + `MATCH_FINISHED` sin `data` | 17 / 17 | `null` |
  | fighting abandonada a mitad del round 1: `PLAYER_LEFT` + `MATCH_FINISHED` sin `data` | 12 / 12 | `null` |
  | tetris completa con `MATCH_FINISHED` sin `data` | 31 / 31 | `null` (patrón `BACK_TO_BACK`) |

  Conclusión: `data.ai`, las partidas sin ganador y el cierre de respaldo de la consola funcionan con GameStats tal como está.
- [ ] Definir el formato exacto de las respuestas de `/api/games` y `/api/stats/...` cuando se implementen.
- [x] Revisión de Dylan (7-nov): rutas de nginx, cierre de respaldo, `STOP`, partidas ocultas, `playerId` distintos, nada por frame, registry en Node/TS. Incorporado en esta versión.
