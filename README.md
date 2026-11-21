# DnD Games · GameConsole

**Proyecto 2 — Lenguajes de Programación**
Instituto Tecnológico de Costa Rica, Sede San Carlos
Profesor: Oscar Viquez Acuña

| Integrante | Partes |
|---|---|
| Danny Gonzalez Molina | 4 en línea, IA en Prolog, registry, panel, envío de eventos, GameStats Scala v1.1, Docker y CI/CD |
| Dylan Mendez Zamora | Consola, SDK, Tetris, peleas, GameStats Go v1.1 |

---

**DnD Games** (por **D**anny a**n**d **D**ylan) es una consola web de videojuegos orientada a objetos, con inteligencia de juego en Prolog y estadísticas en vivo de **GameStats**, con una temática navideña propia. El repositorio se llama `gameconsole`.

Es la **continuación de [GameStats](https://github.com/GameStats-Danny-Dylan/gamestats)** (Proyecto 1). En el P1 un simulador generaba las partidas; aquí las generan **juegos de verdad**, y GameStats las sigue analizando con el mismo contrato de eventos.

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
- **Panel en vivo:** muestra las estadísticas que calcula GameStats (por juego y generales, clasificación de jugadores, partidas en curso) mientras se juega, al lado de las partidas.
- **Pensada para quien la usa por primera vez:** portada con "Cómo funciona", "Cómo se juega" de cada juego por partes (objetivo, pasos, controles y consejos), avisos y confirmaciones, revisada con las 10 heurísticas de Nielsen.

## 2. Cómo cumple el enunciado

| Pide el enunciado | Cómo se cumple | Dónde |
|---|---|---|
| Consola web que carga **3 juegos distintos** | Menú dinámico con los juegos registrados; cada juego se abre en un iframe | [`console/`](console/), [`games/`](games/) |
| **Partidas en paralelo**, en la misma consola o en pestañas | Una sesión por iframe; cada partida con `matchId = {juego}-{uuid}` | [`console/src/match/`](console/src/match/) |
| **POO** en los juegos | Clases con responsabilidades separadas (dominio, reglas, adaptador, vista), interfaces, herencia de `GameApp` | [`games/connect4/src/`](games/connect4/src/), [`sdk/`](sdk/) |
| Al menos 1 juego **usuario vs computadora con Prolog** (no azar) | 4 en línea: negamax + alfa-beta en SWI-Prolog; el juego manda el tablero y usa la columna que devuelve | [`prolog/`](prolog/) |
| **Eventos compatibles con GameStats** | Mismo contrato del P1 (campos, tipos, `POST /events`); los eventos pasan las 20 reglas de contexto de Scala | [`docs/protocolo.md` §5](docs/protocolo.md) |
| **Envío concurrente** sin bloquear, con manejo de fallos | `EventSender`: una cola por partida, lotes, reintentos 1-2-4-8 s, `sendBeacon` al cerrar | [`console/src/sending/`](console/src/sending/) |
| **Panel integrado** con estadísticas de GameStats por juego y generales, **instancias por juego**, en vivo | Botón **Estadísticas** de la consola: abre el panel al lado de las partidas, que siguen corriendo. Consulta a GameStats cada 3 s; no recalcula nada. Las tarjetas del menú también muestran en vivo las partidas en curso y jugadas de cada juego | [`panel/`](panel/), [`console/src/ui/StatsDrawer.ts`](console/src/ui/StatsDrawer.ts) |
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

**Requisitos:**

- **Solo [Docker](https://www.docker.com/)**: en Windows y Mac, Docker Desktop instalado y **abierto**. No hace falta instalar Node, Prolog, Go ni Java.
- El puerto **8000** libre (se puede cambiar con `GATEWAY_PORT`).
- Funciona en Windows, Linux y Mac (también con chip Apple).

Hay dos formas de levantarlo. Para probarlo, la **A** es la más rápida.

### A. Probarlo en 5 minutos, con las imágenes publicadas (sin compilar)

**Paso 1: bajar el repositorio** (o solo el archivo [`docker-compose.deploy.yml`](docker-compose.deploy.yml), que es lo único que se usa).

```bash
git clone https://github.com/GameStats-Danny-Dylan/gameconsole.git
cd gameconsole
```

**Paso 2: levantar todo.**

```bash
docker compose -f docker-compose.deploy.yml up -d --wait
```

- Descarga las imágenes ya construidas de GitHub Container Registry (la primera vez, alrededor de 1 GB; después arranca en segundos) y espera a que los 10 servicios estén sanos. Cuando termina, la terminal vuelve a quedar libre.
- Sin variables levanta la **versión entregada, `v1.0.3`**, aunque después se publique algo más en `main`. Para otra versión (por ejemplo `latest`, lo último de `main`):
  - bash: `GAMECONSOLE_TAG=latest docker compose -f docker-compose.deploy.yml up -d --wait`
  - PowerShell: `$env:GAMECONSOLE_TAG="latest"; docker compose -f docker-compose.deploy.yml up -d --wait`

**Paso 3: abrir <http://localhost:8000>** y seguir el [recorrido de la sección 5](#5-cómo-se-usa).

**Paso 4: apagar.**

```bash
docker compose -f docker-compose.deploy.yml down       # apaga y conserva las estadísticas
docker compose -f docker-compose.deploy.yml down -v    # apaga y borra las estadísticas y las partidas en curso
```

### B. Construir y levantar todo desde el código

Es la forma de desarrollo y la que usa el CI. La primera vez tarda varios minutos, porque construye cada app y corre sus pruebas (si alguna falla, esa imagen no se construye).

```bash
git clone https://github.com/GameStats-Danny-Dylan/gameconsole.git
cd gameconsole
docker compose up -d --build --wait    # construye y espera a que todo esté sano
```

Queda en **<http://localhost:8000>**. Para apagar: `docker compose down` (o `down -v` para borrar también las estadísticas).

### Comandos útiles

Con la forma A, a cada comando de `docker compose` se le agrega `-f docker-compose.deploy.yml`.

| Comando | Para qué |
|---|---|
| `docker compose ps` | Ver los servicios y si están sanos |
| `docker compose logs -f console` | Ver los mensajes de un servicio |
| `bash scripts/smoke.sh` | Prueba de humo por el gateway (necesita `curl` y `jq`) |
| `docker compose down` | Apagar (se conservan las estadísticas y las partidas en curso) |
| `docker compose down -v` | Apagar y **borrar** las estadísticas guardadas y las partidas en curso |
| `docker compose up -d --wait` | Volver a encender lo que ya estaba construido (sin compilar de nuevo) |
| `docker compose restart <servicio>` | Reiniciar un solo servicio, por ejemplo `docker compose restart game-tetris` |

Para jugar desde otra computadora, ver [Jugar desde otra computadora](#jugar-desde-otra-computadora) en la sección 5.

Se guardan en dos volúmenes: `analytics-results` (los resultados de Scala) y `ingestion-data` (las partidas en curso de Go, para que un reinicio de `ingestion` no las corte).

### Variables (opcionales, en la terminal o en un archivo `.env`)

| Variable | Por defecto | Qué es |
|---|---|---|
| `GATEWAY_PORT` | `8000` | Puerto de la PC donde se publica todo |
| `GAMESTATS_TAG` | `v1.3` | Versión de las imágenes de GameStats |
| `ANALYTICS_IMAGE`, `INGESTION_IMAGE` | las de GHCR | Usar una imagen local de GameStats (por ejemplo, una versión sin publicar) |
| `GAMECONSOLE_TAG` | `v1.0.3` | Versión de las imágenes de GameConsole (solo en `docker-compose.deploy.yml`); `latest` = lo último de `main` |

## 5. Cómo se usa

### Recorrido para probarlo por primera vez

1. **Abrir <http://localhost:8000>.** La portada muestra "Cómo funciona" en 3 pasos y el estado del sistema: **Juegos · 3 disponibles** y **GameStats · Al día**.
2. **Elegir un juego.** Pulsar **Ver los juegos** y, en la tarjeta del **4 en línea**, **¡A jugar!**. Se abre "Nueva partida" en pantalla completa: a la izquierda, cómo se juega; a la derecha, las opciones.
3. **Jugar contra la computadora.** Dejar el modo **Contra la computadora**, elegir la dificultad (Fácil, Media o Difícil), escribir un nombre y pulsar **▶ Jugar**. Se juega con clic en una columna o con las teclas **1** a **7**. Cada jugada de la computadora la decide Prolog.
4. **Abrir otra partida a la vez.** Volver a "Elige un juego" y abrir **Tetris** (flechas para mover y girar, **Espacio** para dejar caer). Las dos partidas corren al mismo tiempo. También se puede abrir <http://localhost:8000> en **otra pestaña** y jugar **Pelea** (2 personas en el mismo teclado: **A D W F G** contra **← → ↑ K L**).
5. **Ver las estadísticas en vivo.** El botón **Estadísticas** de la cabecera abre el panel al lado de las partidas, que siguen corriendo: pestaña **General** y una por juego, con las partidas jugándose y terminadas (instancias), la clasificación y las jugadas destacadas. Se actualiza cada 3 s mientras se juega.
6. **Terminar o cerrar.** Al terminar una partida aparece quién ganó y el botón **Jugar otra**. **Cerrar** pide confirmar; si la partida seguía, termina sin ganador y GameStats la registra así.

Cada partida tiene su botón **? Cómo se juega** con el objetivo, los pasos, los controles y consejos.

### Direcciones

| Dirección | Qué hay |
|---|---|
| <http://localhost:8000/> | **Consola**: elegir un juego, leer cómo se juega, escribir los nombres, elegir opciones y jugar. Se pueden abrir varias partidas a la vez. El botón **Estadísticas** muestra el panel al lado de las partidas |
| <http://localhost:8000/panel/> | **Panel**: estadísticas generales y por juego, clasificación, partidas en curso |
| <http://localhost:8000/games/connect4/> | 4 en línea en **modo de prueba**, sin la consola |
| <http://localhost:8000/api/registry/games> | Juegos registrados en este momento |
| <http://localhost:8000/api/matches> | **GameStats por dentro (Go):** cada partida con su estado (`en_curso`, `enviada`…) y sus eventos recibidos |
| <http://localhost:8000/api/stats/overview> | **GameStats por dentro (Scala):** las estadísticas que muestra el panel, en JSON |

**Varias partidas a la vez:** desde la consola se abren varias partidas (cada una en su cuadro) o se abre la consola en varias pestañas. Cada partida manda sus eventos por separado. Si una partida deja de verse, se pausa sola, y puede quedar en pausa hasta **20 minutos** sin que GameStats la dé por abandonada (en pausa no hay eventos; los compose suben a 20 min el tiempo de espera de Go, que por defecto es 1 min en Tetris y 2 en peleas). Cerrar una partida o la pestaña la cierra en GameStats al instante. Lo único que no alcanza a avisar es un cierre forzado (se cuelga el navegador o se apaga la PC): esa partida aparece "en curso" hasta que pasan los 20 minutos y Go la da por abandonada.

**Antes de una demostración**, conviene empezar con `docker compose down -v`: borra las estadísticas guardadas, y las partidas analizadas por una versión anterior de GameStats no se recalculan solas.

### Jugar desde otra computadora

Una sola PC levanta el sistema y las demás solo abren el navegador. **Todo se guarda en el GameStats de la PC que lo levantó:** las partidas de las otras computadoras aparecen en su panel. Si cada persona levanta su propia copia, cada una tiene su propio GameStats y no se comparten.

**En la misma red** (misma casa, mismo wifi):

1. En la PC que levantó el sistema, buscar su IP: en PowerShell, `ipconfig`, y copiar la «Dirección IPv4» del adaptador de wifi o de red (por ejemplo, `192.168.1.20`).
2. Permitir el puerto 8000 en el firewall de Windows. En **PowerShell como administrador**:
   ```powershell
   New-NetFirewallRule -DisplayName "DnD Games 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
   ```
   Para quitar el permiso después: `Remove-NetFirewallRule -DisplayName "DnD Games 8000"`.
3. En la otra computadora, abrir `http://<esa IP>:8000`, por ejemplo `http://192.168.1.20:8000`.

Entrando por la IP, el navegador no ofrece `crypto.randomUUID` (no es HTTPS ni `localhost`), así que el SDK arma el `matchId` con `newUuid`, que tiene un respaldo. La prueba de punta a punta entrando por la IP de la red da 38/38.

**Por internet** (otra casa), con un túnel de Cloudflare, sin abrir puertos:

| Paso | Forma A (imágenes publicadas) | Forma B (desde el código) |
|---|---|---|
| Encender el túnel | `docker compose -f docker-compose.deploy.yml --profile tunnel up -d --wait` | `docker compose --profile tunnel up -d --wait` |
| Ver la dirección pública | `docker compose -f docker-compose.deploy.yml logs tunnel` | `docker compose logs tunnel` |
| Apagar solo el túnel | `docker compose -f docker-compose.deploy.yml stop tunnel` | `docker compose stop tunnel` |
| Apagar todo, túnel incluido | `docker compose -f docker-compose.deploy.yml --profile tunnel down` | `docker compose --profile tunnel down` |

En los mensajes del túnel aparece una dirección `https://….trycloudflare.com`: esa se le pasa a la otra persona. Cambia cada vez que se enciende el túnel y funciona mientras la PC que lo levantó esté encendida. Cualquiera con esa dirección puede entrar, así que conviene apagar el túnel al terminar.

## 6. Deployment

Igual que en GameStats: el CD publica las imágenes en **GitHub Container Registry** y cualquier PC con Docker levanta la versión publicada **sin compilar nada**, con `docker-compose.deploy.yml` (los comandos están en la [forma A de la sección 4](#a-probarlo-en-5-minutos-con-las-imágenes-publicadas-sin-compilar)). Ese es el entorno de ejecución que elegimos, como en GameStats: no mantenemos un servidor encendido; el job `deploy` del CD comprueba en una máquina limpia que la versión publicada funciona.

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
| `ghcr.io/gamestats-danny-dylan/gamestats-analytics:v1.3` | GameStats: análisis en Scala ([release v1.3](https://github.com/GameStats-Danny-Dylan/gamestats/releases/tag/v1.3)) |
| `ghcr.io/gamestats-danny-dylan/gamestats-ingestion:v1.3` | GameStats: ingesta en Go (mismo release) |

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

### GameStats v1.1: persistencia de las partidas en curso

Si `ingestion` (Go) se reinicia en medio de una partida, antes la perdía y Scala recibía partidas incompletas. En v1.1 guarda las partidas en curso en disco (`DATA_DIR`, volumen `ingestion-data`) y rechaza eventos de partidas cuyo `MATCH_STARTED` no vio. Probado: con un reinicio a mitad de partida, Scala la recibe completa.

### GameStats v1.2: una partida terminada siempre llega a Scala

Si Scala está caído cuando termina una partida, Go hace 3 reintentos rápidos (1, 2 y 4 s) y, si siguen fallando, deja la partida como `reintentando` y la reenvía cada 30 s hasta que Scala la reciba. Mientras espera, conserva su archivo en `DATA_DIR`, así que tampoco se pierde si Go se reinicia. Con esto, los dos tramos del envío reintentan sin perder eventos: consola → Go (cola por partida en el `EventSender`) y Go → Scala. Probado: 30 partidas con Scala apagado y un reinicio de Go en el medio; al volver Scala llegaron las 30, con todos sus eventos.

### GameStats v1.3: partidas cortadas

Si una partida se cierra antes de terminar (botón **Cerrar** o la pestaña), el juego manda `MATCH_FINISHED` con `reason: "stopped"`. GameStats la marca como **cortada**: cuenta como jugada, pero no como ganada, perdida ni empate, y en la clasificación va en su propia columna (**Cortadas**). Así coincide con lo que dice la consola al cerrar ("termina sin ganador"). Antes, una pelea cerrada ganando 1 round de 3 se contaba como victoria.

### "Cómo se juega" de cada juego

Cada `game.json` puede traer `instructions`: el objetivo, los pasos, los controles (por jugador si hace falta) y consejos. La consola lo muestra **antes de jugar** (en el panel de nueva partida) y **durante la partida** (botón "? Cómo se juega"), en secciones que se abren y cierran con un clic. Como viene del manifiesto, un juego nuevo trae sus propias instrucciones sin tocar la consola.

### Diseño: temática DnD Games

Una temática navideña propia (sin personajes ni marcas de terceros): letras Poppins e Inter, rojo navidad, dorado y verde pino, modo claro tipo cabaña y oscuro de noche de invierno, nieve, guirnalda de luces y los juegos como regalos. Los botones tienen relieve e ícono, y la información es texto plano, para que nunca se confundan. Detalle en [`console/README.md`](console/README.md#6-diseño-temática-dnd-games).

### Usabilidad para quien la usa por primera vez

La consola se revisó contra las **10 heurísticas de Nielsen**: estado siempre visible (indicadores y avisos), lenguaje de jugador, "Cómo funciona" en la portada, "Cómo se juega" antes y durante cada partida, confirmación antes de cerrar una partida en curso y mensajes de error que dicen qué hacer. La tabla completa está en [`console/README.md`](console/README.md#7-usabilidad-heurísticas-de-nielsen).

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
| Consola | 107 (Vitest), incluidos el EventSender y los datos en vivo | `cd console && npm ci && npm test` |
| SDK | 82 (Vitest) | `cd sdk && npm ci && npm test` |
| 4 en línea | 44 (Vitest), incluidas 3000 partidas al azar contra una copia de las reglas de Scala | `cd games/connect4 && npm ci && npm test` |
| 4 en línea contra GameStats real | partidas simuladas y una entera contra Prolog | con el compose corriendo: `GAMESTATS_URL=http://localhost:8000 npm run test:gamestats` |
| Tetris | 58 (Vitest), incluidos eventos contra una copia de las reglas de Scala | `cd games/tetris && npm ci && npm test` |
| Peleas | 106 (Vitest), incluidas peleas al azar contra una copia de las reglas de Scala, el dibujo, los efectos y el sonido | `cd games/fighting && npm ci && npm test` |
| Registry | 15 (`node:test`) | `cd registry && npm ci && npm test` |
| Panel | 8 (Vitest) | `cd panel && npm ci && npm test` |
| Prolog | 18 (plunit) | `cd prolog && swipl tests.pl` |
| Todo integrado | prueba de humo | con el compose corriendo: `bash scripts/smoke.sh` |
| **De punta a punta** | 38 comprobaciones con un navegador real que juega de verdad | con el compose corriendo: `node scripts/e2e.mjs http://localhost:8000 gameconsole ./e2e-out` |

Con Docker no hace falta instalar nada: cada imagen corre sus pruebas al construirse.

**La prueba de punta a punta** (`scripts/e2e.mjs`) abre la consola en Edge o Chrome sin ventana y revisa, sobre el sistema levantado. Necesita Node 22 o más, Edge (en Windows lo busca solo) o Chrome con `BROWSER=<ruta al ejecutable>`, y el sistema corriendo con cualquiera de las dos formas de la sección 4 (el proyecto de Docker Compose se llama `gameconsole` en las dos). Apaga y vuelve a encender `ingestion` y `game-tetris` durante la prueba.

| Qué | Cómo |
|---|---|
| Los 3 juegos | Aparecen solos en el menú (registry) y se juegan hasta el final: 4 en línea contra la IA en difícil, Tetris hasta perder y una pelea de 1 round |
| Partidas en paralelo | Las tres a la vez, en **dos pestañas**; GameStats ve las 3 en curso mientras se juegan |
| Eventos | Captura lo que la consola manda a `/api/events`: cada partida con su `matchId`, ningún envío mezcla partidas, todos los campos del contrato, `MATCH_STARTED` … `MATCH_FINISHED`, tiempos en orden y `eventId` únicos |
| Prolog | Cada jugada de la computadora trae `data.ai` (`prolog-minimax`, profundidad, nodos) y Prolog tapa una amenaza conocida |
| GameStats | Go tiene exactamente los eventos que mandó la consola y Scala analizó cada partida |
| Panel | Los totales generales y por juego son los mismos que devuelve GameStats |
| Fallos | Se apaga GameStats a mitad de una partida: la consola avisa, sigue y al volver manda todo sin perder nada. Cerrar la pestaña cierra la partida en GameStats al instante |
| Descubrimiento | Se apaga Tetris y desaparece del menú; se enciende y vuelve |

Resultados del 20-nov:

| Contra qué | Resultado |
|---|---|
| `v1.0` publicada (clon limpio, imágenes de GHCR) | 36/38: una partida recién abierta podía pausarse sola antes de quedar a la vista |
| `v1.0.1` publicada (clon limpio, imágenes de GHCR, GameStats `v1.2`) | **38/38** |
| `v1.0.2` desde el código, entrando por la IP de la red (`http://<IP>:8000`) | **38/38** (antes, crear una partida por IP fallaba: ver la sección 5) |
| **`v1.0.3` publicada** (clon limpio sin variables: imágenes `v1.0.3` de GHCR y GameStats `v1.3`), entrando por la IP de la red | **38/38**. Además, 16 casos extra: pausa de 75 s (sigue en curso), Scala apagado (la partida queda `reintentando` y llega al volver), juego nuevo `snake`, eventos inválidos rechazados, Prolog en las 3 dificultades, pelea cortada (sin ganador y en "Cortadas"); pelea a ~53 cuadros por segundo; panel sin desplazamiento lateral en 1920 a 390 px |

## 12. Documentación de cada parte

| Documento | Qué explica |
|---|---|
| [`docs/protocolo.md`](docs/protocolo.md) | El contrato completo: rutas, manifiesto, registry, mensajes, eventos, envío, IA y panel |
| [`console/README.md`](console/README.md) | La consola: qué ve la persona, el envío de eventos, el diseño y las heurísticas de Nielsen |
| [`sdk/README.md`](sdk/README.md) | `GameApp`, el sellado de eventos, el manifiesto, el servidor de cada juego, el tema y cómo se construye un juego nuevo |
| [`games/connect4/README.md`](games/connect4/README.md) | El 4 en línea: reglas, IA, POO, patrones y eventos |
| [`games/tetris/README.md`](games/tetris/README.md) | Tetris: reglas, puntaje, POO, patrones y eventos |
| [`games/fighting/README.md`](games/fighting/README.md) | Peleas: reglas del combate, POO, patrones y eventos |
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
| Diseño DnD Games y usabilidad (heurísticas de Nielsen) | ✅ |
| GameStats v1.3 publicado y en los compose (`GAMESTATS_TAG=v1.3`) | ✅ |
| Video de demostración | pendiente |
