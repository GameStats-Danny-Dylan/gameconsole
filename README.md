# GameConsole

Consola web de videojuegos orientada a objetos, con inteligencia de juego en Prolog y estadísticas en vivo de **GameStats**.

Es la **continuación de [GameStats](https://github.com/GameStats-Danny-Dylan/gamestats)** (Proyecto 1). En el P1 un simulador generaba las partidas; aquí las generan **juegos de verdad**, y GameStats las sigue analizando con el mismo contrato de eventos.

Proyecto 2 del curso Lenguajes de Programación · Danny González y Dylan Mendez · noviembre de 2026.

---

## Contenido

1. [Qué hace](#1-qué-hace)
2. [Cómo cumple el enunciado](#2-cómo-cumple-el-enunciado)
3. [Arquitectura](#3-arquitectura)
4. [Instalación y ejecución](#4-instalación-y-ejecución)
5. [Cómo se usa](#5-cómo-se-usa)
6. [Deployment](#6-deployment)
7. [CI/CD](#7-cicd)
8. [Decisiones técnicas](#8-decisiones-técnicas)
9. [Patrones de diseño](#9-patrones-de-diseño)
10. [Estructura del repositorio](#10-estructura-del-repositorio)
11. [Pruebas](#11-pruebas)
12. [Documentación de cada parte](#12-documentación-de-cada-parte)
13. [Estado](#13-estado)

---

## 1. Qué hace

- **Tres juegos independientes:** 4 en línea, Tetris y peleas. Cada uno es una **app propia**, con su contenedor y su manifiesto (`game.json`).
- **Descubrimiento automático:** la consola no conoce los juegos de antemano. Cada juego **se registra solo** al arrancar y la consola arma el menú con los que están vivos. Agregar un cuarto juego es levantar su contenedor.
- **Varias partidas a la vez:** cada partida corre en su propio iframe, en la misma consola o en pestañas distintas, con un identificador único (`matchId`).
- **IA en Prolog:** en el 4 en línea contra la computadora, cada jugada la decide Prolog con minimax y poda alfa-beta, en tres dificultades.
- **Eventos para GameStats:** los juegos generan eventos con el contrato del P1 y la consola los envía en paralelo, sin bloquear nada y reintentando si GameStats no responde.
- **Panel en vivo:** muestra las estadísticas que calcula GameStats (por juego y generales, clasificación de jugadores, partidas en curso) mientras se juega.

## 2. Cómo cumple el enunciado

| Pide el enunciado | Cómo se cumple | Dónde |
|---|---|---|
| Consola web que carga **3 juegos distintos** | Menú dinámico con los juegos registrados; cada juego se abre en un iframe | [`console/`](console/), [`games/`](games/) |
| **Partidas en paralelo**, en la misma consola o en pestañas | Una sesión por iframe; cada partida con `matchId = {juego}-{uuid}` | [`console/src/match/`](console/src/match/) |
| **POO** en los juegos | Clases con responsabilidades separadas (dominio, reglas, adaptador, vista), interfaces, herencia de `GameApp` | [`games/connect4/src/`](games/connect4/src/), [`sdk/`](sdk/) |
| Al menos 1 juego **usuario vs computadora con Prolog** (no azar) | 4 en línea: negamax + alfa-beta en SWI-Prolog; el juego manda el tablero y usa la columna que devuelve | [`prolog/`](prolog/) |
| **Eventos compatibles con GameStats** | Mismo contrato del P1 (campos, tipos, `POST /events`); los eventos pasan las 20 reglas de contexto de Scala | [`docs/protocolo.md` §5](docs/protocolo.md) |
| **Envío concurrente** sin bloquear, con manejo de fallos | `EventSender`: una cola por partida, lotes, reintentos 1-2-4-8 s, `sendBeacon` al cerrar | [`console/src/sending/`](console/src/sending/) |
| **Panel** con estadísticas de GameStats por juego y generales, **instancias por juego**, en vivo | Consulta a GameStats cada 3 s; no recalcula nada | [`panel/`](panel/) |
| **Git, Docker, CI/CD, deployment** equivalente a GameStats | Docker Compose, imágenes en GHCR, CI por app, CD con integración, publicación y deploy verificado | [§6](#6-deployment), [§7](#7-cicd) |
| Documentación breve y video | Este README, el protocolo y el README de cada parte | [§12](#12-documentación-de-cada-parte) |

## 3. Arquitectura

```
                         navegador
   ┌──────────────────────────────────────────────────────┐
   │ consola ── iframe /games/connect4/  (partida 1)       │
   │         ── iframe /games/tetris/    (partida 2)       │   panel /panel/
   │         ── iframe /games/connect4/  (partida 3) …     │
   └───────────────────────────┬──────────────────────────┘
                               │ un solo origen: http://<host>:8000
                         ┌─────▼─────┐
                         │  gateway  │  nginx: la única puerta de entrada
                         └─────┬─────┘
   ┌──────────┬────────────┬───┴──────┬───────────┬───────────┬────────────────────────────┐
 console   game-{id}      panel     registry    prolog       GameStats (Proyecto 1)
           un contenedor            juegos      IA del      ingestion (Go) ──► analytics (Scala)
           por juego                vivos       4 en línea  /api/events        /api/stats, /api/results
```

**Recorrido de un evento:** el juego registra un hecho (por ejemplo, "cayó una ficha en la columna 4") → su **adapter** lo convierte al contrato de GameStats → el **SDK** le pone `eventId`, `timestamp`, `gameId`, `gameVersion` y `matchId` → lo manda a la consola por `postMessage` → el **EventSender** de la consola lo envía a `/api/events` (Go) → Go agrupa la partida y, al terminar, la manda a Scala → Scala calcula las estadísticas → el **panel** las consulta.

| Componente | Qué hace | Tecnología |
|---|---|---|
| [`gateway/`](gateway/) | Puerta de entrada: rutas a la consola, al panel, a cada juego y a las APIs | nginx 1.28 |
| [`console/`](console/) | Consola: menú, formulario de partida, iframes, envío de eventos | TypeScript + Vite |
| [`sdk/`](sdk/) | Protocolo consola ↔ juego (`GameApp`), sellado de eventos, tema común y servidor de cada juego | TypeScript, Node |
| [`games/connect4/`](games/connect4/) | 4 en línea: contra la computadora o 2 personas | TypeScript + Vite |
| [`games/tetris/`](games/tetris/) | Tetris: 1 persona, 15 niveles iniciales | TypeScript + Vite (canvas) |
| [`games/fighting/`](games/fighting/) | Peleas: 2 personas en el mismo teclado, al mejor de 1, 3 o 5 rounds | TypeScript + Vite (canvas) |
| [`registry/`](registry/) | Descubrimiento de juegos: registro, latido, vencimiento | Node + TypeScript |
| [`prolog/`](prolog/) | IA del 4 en línea | SWI-Prolog 10 |
| [`panel/`](panel/) | Panel de estadísticas en vivo | TypeScript + Vite |
| GameStats | `ingestion` (Go) recibe eventos; `analytics` (Scala) calcula estadísticas | imágenes publicadas, no se compilan aquí |

Rutas del gateway:

| Ruta | Va a |
|---|---|
| `/` | consola |
| `/games/{id}/` | contenedor `game-{id}` (cualquier juego, sin tocar nginx) |
| `/panel/` | panel |
| `/api/events`, `/api/matches`, `/api/games` | GameStats `ingestion` (Go) |
| `/api/stats/…`, `/api/results…`, `/api/players/…` | GameStats `analytics` (Scala) |
| `/api/registry/…` | registry |
| `/api/ai/…` | Prolog |

## 4. Instalación y ejecución

**Requisito:** Docker (Docker Desktop en Windows o Mac). No hace falta instalar Node, Prolog, Go ni Java.

### Construir y levantar todo desde el código

```bash
git clone https://github.com/GameStats-Danny-Dylan/gameconsole.git
cd gameconsole
docker compose up -d --build --wait    # construye y espera a que todo esté sano
```

Queda en **<http://localhost:8000>**. Al construir, cada imagen corre sus pruebas: si alguna falla, no se construye.

### Comandos útiles

| Comando | Para qué |
|---|---|
| `docker compose ps` | Ver los servicios y si están sanos |
| `docker compose logs -f console` | Ver los mensajes de un servicio |
| `bash scripts/smoke.sh` | Prueba de humo por el gateway (necesita `curl` y `jq`) |
| `docker compose down` | Apagar (las estadísticas se conservan) |
| `docker compose down -v` | Apagar y **borrar** las estadísticas guardadas |

### Variables (opcionales, en la terminal o en un archivo `.env`)

| Variable | Por defecto | Qué es |
|---|---|---|
| `GATEWAY_PORT` | `8000` | Puerto de la PC donde se publica todo |
| `GAMESTATS_TAG` | `v1.0` | Versión de las imágenes de GameStats |
| `ANALYTICS_IMAGE`, `INGESTION_IMAGE` | las de GHCR | Usar una imagen local de GameStats (por ejemplo, una versión sin publicar) |
| `GAMECONSOLE_TAG` | `latest` | Versión de las imágenes de GameConsole (solo en `docker-compose.deploy.yml`) |

## 5. Cómo se usa

| Dirección | Qué hay |
|---|---|
| <http://localhost:8000/> | **Consola**: elegir un juego, escribir los nombres, elegir opciones y jugar. Se pueden abrir varias partidas a la vez |
| <http://localhost:8000/panel/> | **Panel**: estadísticas generales y por juego, clasificación, partidas en curso |
| <http://localhost:8000/games/connect4/> | 4 en línea en **modo de prueba**, sin la consola |
| <http://localhost:8000/api/registry/games> | Juegos registrados en este momento |

**Varias partidas a la vez:** desde la consola se abren varias partidas (cada una en su cuadro) o se abre la consola en varias pestañas. Cada partida manda sus eventos por separado. Si una partida deja de verse, se pausa sola.

**Desde otra computadora:**
- En la misma red: `http://<IP de la PC>:8000` (puede hacer falta permitir el puerto en el firewall).
- Por internet: `docker compose --profile tunnel up -d` levanta un túnel de Cloudflare. La URL pública (`https://….trycloudflare.com`) aparece en `docker compose logs tunnel`. Funciona mientras la PC que lo levantó esté encendida.

## 6. Deployment

Igual que en GameStats: el CD publica las imágenes en **GitHub Container Registry** y cualquier PC con Docker levanta la versión publicada **sin compilar nada**:

```bash
# Solo hace falta docker-compose.deploy.yml
docker compose -f docker-compose.deploy.yml up -d --wait
# Una versión concreta:
GAMECONSOLE_TAG=v1.0 docker compose -f docker-compose.deploy.yml up -d --wait
```

| Imagen | Contenido |
|---|---|
| `ghcr.io/gamestats-danny-dylan/gameconsole-gateway` | nginx |
| `ghcr.io/gamestats-danny-dylan/gameconsole-console` | consola |
| `ghcr.io/gamestats-danny-dylan/gameconsole-game-connect4` | 4 en línea (con `sdk/server`) |
| `ghcr.io/gamestats-danny-dylan/gameconsole-game-tetris` | Tetris (con `sdk/server`) |
| `ghcr.io/gamestats-danny-dylan/gameconsole-game-fighting` | Peleas (con `sdk/server`) |
| `ghcr.io/gamestats-danny-dylan/gameconsole-registry` | registry |
| `ghcr.io/gamestats-danny-dylan/gameconsole-prolog` | IA en Prolog |
| `ghcr.io/gamestats-danny-dylan/gameconsole-panel` | panel |
| GameStats: `gamestats-analytics`, `gamestats-ingestion` | del repo `gamestats` |

Todas para `amd64` y `arm64` (también funcionan en una Mac con chip Apple).

**Versiones:** cada push a `main` publica `latest` y el hash del commit; cada tag `v*` publica esa versión.

## 7. CI/CD

| Workflow | Cuándo | Qué hace |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Cada push y PR | Instala, compila y prueba cada app por separado (consola, SDK, los 3 juegos, registry, panel), corre las pruebas de Prolog y valida la configuración de nginx |
| [`cd.yml`](.github/workflows/cd.yml) | PR a `main`: solo el paso 1. Push a `main` o tag `v*`: los 3 | **1. Integración:** levanta todo con Docker Compose, corre la prueba de humo y manda partidas del 4 en línea a GameStats real (Scala no puede descartar ningún evento). **2. Publicación:** construye y publica las imágenes en GHCR. **3. Deploy:** levanta `docker-compose.deploy.yml` con las imágenes **descargadas** y repite la prueba de humo |

El paso 3 hace exactamente lo que haría quien recibe el proyecto: si pasa, la versión publicada funciona.

## 8. Decisiones técnicas

### Tecnologías

El enunciado deja libres las tecnologías, salvo Prolog para la IA.

- **TypeScript + Vite** para todo lo que corre en el navegador (consola, juegos, panel): clases, interfaces y tipos para la POO, y el mismo lenguaje en todas las apps.
- **Node (`node:http`, sin frameworks)** para el registry y el servidor de cada juego: pocas dependencias y arranque rápido.
- **SWI-Prolog** con su librería HTTP para la IA, en su propio contenedor.
- **GameStats sigue en Go y Scala**, tal como se entregó en el P1.

### Un repo, apps independientes

Todas las apps están en este repo, pero cada juego es una app aparte: su carpeta, su Dockerfile, su contenedor y su manifiesto. La consola no tiene ningún juego "quemado": los conoce por el registry. GameStats vive en **otro repo** (`gamestats`) porque es una plataforma externa que se reutiliza; aquí se usan sus imágenes publicadas.

### Protocolo estándar entre consola y juegos

Todo juego habla el mismo protocolo ([`docs/protocolo.md`](docs/protocolo.md)):
- consola → juego: `INIT`, `START`, `PAUSE`, `RESUME`, `STOP`;
- juego → consola: `READY`, `STATE`, `GAME_EVENT`, `FINISHED`, `ERROR`.

El **SDK** lo implementa una sola vez (`GameApp`) y cada juego solo llena sus pasos. Además le pone a cada evento los campos comunes, con timestamps que siempre avanzan.

### Descubrimiento automático

Cada juego trae `sdk/server`, que al arrancar manda su manifiesto al **registry** y después un latido cada 5 s. Si un juego pasa 15 s sin latir, sale del menú. nginx encuentra el contenedor por su nombre (`game-{id}`), así que tampoco hay que tocar nginx para agregar un juego.

### Eventos compatibles con GameStats

- Se usa el **contrato del P1 sin cambios**: los mismos 9 tipos (`MATCH_STARTED`, `PLAYER_JOINED`, `PLAYER_ACTION`, `MATCH_FINISHED`…) y las acciones de cada juego que GameStats ya conocía (por ejemplo `DISC_DROPPED`, `THREAT_CREATED` y `CONNECT_FOUR` en el 4 en línea).
- Los ejemplos del enunciado `AI_DECISION` y `PLAYER_WON` / `PLAYER_LOST` son ilustrativos. No se agregaron como tipos nuevos para no romper el contrato:
  - la decisión de la IA va como dato extra en `data.ai` de la ficha de la computadora (motor, profundidad, puntaje, posiciones revisadas y tiempo); el contrato permite datos propios en `data`;
  - el ganador lo calcula GameStats a partir de los eventos.
- Los eventos respetan las **20 reglas de contexto** de Scala (turnos, gravedad, nada durante la pausa…). Se comprueba con miles de partidas al azar y contra GameStats real en el CD.

### Envío concurrente de eventos

El `EventSender` de la consola ([`console/src/sending/`](console/src/sending/)):
- tiene **una cola por partida**, así una partida lenta o con errores no frena a las otras y nunca se mezclan eventos de partidas distintas;
- manda **lotes** a `POST /api/events` cada 500 ms o al juntar 20 eventos, en orden y sin dos envíos de la misma partida a la vez;
- si GameStats no responde o da un error 5xx, **reintenta** a los 1, 2, 4 y 8 s y después cada 8 s, sin perder eventos; un evento rechazado se avisa y no se reintenta;
- si una partida se cierra sin terminar (pestaña cerrada, juego colgado), manda un **cierre de respaldo** (`PLAYER_LEFT` y `MATCH_FINISHED`) para que GameStats no la deje abierta;
- al cerrar la pestaña, lo pendiente sale con `navigator.sendBeacon`.

Todo es asíncrono: ni la consola ni los juegos esperan a la red. La cabecera de la consola muestra el estado del envío.

### IA en Prolog

El juego manda a Prolog el tablero, el color y la dificultad, y usa la columna que recibe. Prolog busca con **negamax y poda alfa-beta** y evalúa las 69 líneas posibles del tablero. Las dificultades cambian cuánto mira hacia adelante y qué evalúa, sin azar; se calibraron midiendo partidas. Detalle en [`prolog/README.md`](prolog/README.md).

### El panel no recalcula nada

El panel solo muestra lo que devuelve GameStats. Para eso GameStats v1.1 agregó consultas nuevas en su propio repo, respetando la separación:
- `GET /stats/overview` y `GET /stats/games/{id}` (Scala): estadísticas generales, por juego y clasificación de jugadores;
- `GET /games` (Go): partidas en curso por juego.

GameStats v1.1 también acepta cualquier `gameId`, para que un juego nuevo se analice con estadísticas genéricas.

### Un solo origen

Todo pasa por nginx: no hace falta CORS, el código no tiene `localhost` escrito, y el mismo compose sirve en una PC, detrás del túnel o en un servidor.

## 9. Patrones de diseño

| Patrón | Dónde | Para qué |
|---|---|---|
| **Adapter** | `GameStatsAdapter` (cada juego), `EventStamper` (SDK) | Convertir los hechos de un juego al contrato de GameStats |
| **Observer** | `Connect4Match.facts`, `EventBus` de la consola, `GameRegistry`, `PanelStore`, `EventSender` | Avisar cambios sin que quien avisa conozca a quien escucha |
| **Template Method** | `GameApp` del SDK | El SDK maneja el protocolo; cada juego llena `onInit`, `onStart`, `onPause`, `onResume`, `onStop` |
| **State** | Estados de `GameApp`, de `MatchSession` y de `Connect4Game` | Cada mensaje solo vale en ciertos estados de la partida |
| **Mediator** | `MatchMediator` | Reparte los mensajes de todos los iframes a la sesión que corresponde |
| **Factory** | `MatchSessionFactory`, `MatchContextFactory` | Crear partidas (iframe, sesión, `matchId`) en un solo lugar |
| **Strategy** | `MoveStrategy` / `PrologStrategy`, `RetryPolicy` | Cómo elige jugada la computadora; cuánto esperar antes de reintentar |
| **Decorator** | `MinThinkTime` | Que la computadora "piense" al menos 0,7 s sin tocar la estrategia |
| **Command** | Fichas del 4 en línea | Deshacer una jugada volviendo al estado anterior |
| **Proxy** | `PrologStrategy`, el gateway | Pedir una jugada como si fuera local; una sola puerta hacia todos los servicios |
| **Facade** | `GameStatsClient` del panel, `ConsoleShell` | Una interfaz simple sobre varias consultas o piezas |
| **Registry** | `GameRegistry` | Un solo lugar donde los juegos se anotan y la consola los busca |

## 10. Estructura del repositorio

```
gameconsole/
├── console/                 consola web (menú, partidas, EventSender)
├── sdk/                     protocolo, GameApp, sellado de eventos, tema y sdk/server
├── games/
│   ├── connect4/            4 en línea
│   ├── tetris/              Tetris
│   └── fighting/            peleas
├── registry/                descubrimiento de juegos
├── prolog/                  IA en SWI-Prolog
├── panel/                   panel de estadísticas
├── gateway/                 nginx
├── docs/protocolo.md        el contrato entre todas las piezas
├── scripts/smoke.sh         prueba de humo
├── docker-compose.yml       construir y levantar todo
├── docker-compose.deploy.yml  levantar las imágenes publicadas
└── .github/workflows/       ci.yml y cd.yml
```

## 11. Pruebas

| Parte | Pruebas | Cómo correrlas |
|---|---|---|
| Consola | 104 (Vitest), incluido el EventSender | `cd console && npm ci && npm test` |
| SDK | 80 (Vitest) | `cd sdk && npm ci && npm test` |
| 4 en línea | 44 (Vitest), incluidas 3000 partidas al azar contra una copia de las reglas de Scala | `cd games/connect4 && npm ci && npm test` |
| 4 en línea contra GameStats real | partidas simuladas y una entera contra Prolog | con el compose corriendo: `GAMESTATS_URL=http://localhost:8000 npm run test:gamestats` |
| Tetris | 58 (Vitest), incluidos eventos contra una copia de las reglas de Scala | `cd games/tetris && npm ci && npm test` |
| Peleas | 63 (Vitest) | `cd games/fighting && npm ci && npm test` |
| Registry | 15 (`node:test`) | `cd registry && npm ci && npm test` |
| Panel | 7 (Vitest) | `cd panel && npm ci && npm test` |
| Prolog | 18 (plunit) | `cd prolog && swipl tests.pl` |
| Todo integrado | prueba de humo | con el compose corriendo: `bash scripts/smoke.sh` |

Con Docker no hace falta instalar nada: cada imagen corre sus pruebas al construirse.

## 12. Documentación de cada parte

| Documento | Qué explica |
|---|---|
| [`docs/protocolo.md`](docs/protocolo.md) | El contrato completo: rutas, manifiesto, registry, mensajes, eventos, envío, IA y panel |
| [`console/README.md`](console/README.md) | La consola y el envío de eventos |
| [`sdk/README.md`](sdk/README.md) | Cómo se construye un juego sobre el SDK |
| [`games/connect4/README.md`](games/connect4/README.md) | El 4 en línea |
| [`games/tetris/README.md`](games/tetris/README.md) | Tetris |
| [`games/fighting/README.md`](games/fighting/README.md) | Peleas |
| [`prolog/README.md`](prolog/README.md) | Cómo decide la computadora |
| [`registry/README.md`](registry/README.md) | El descubrimiento de juegos |
| [`panel/README.md`](panel/README.md) | El panel de estadísticas |
| [`gateway/README.md`](gateway/README.md) | Las rutas de nginx |

## 13. Estado

| Parte | Estado |
|---|---|
| Consola, SDK, registry, gateway | ✅ |
| 4 en línea + IA en Prolog | ✅ |
| Envío de eventos (`EventSender`) | ✅ |
| Panel | ✅ |
| Docker, CI/CD, deployment | ✅ |
| Tetris y peleas | ✅ |
| GameStats v1.1 publicado y en los compose (`GAMESTATS_TAG=v1.1`) | pendiente |
| Video de demostración | pendiente |
