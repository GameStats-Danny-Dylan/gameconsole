# SDK de DnD Games

Implementa **una sola vez** el protocolo entre la consola y los juegos ([`docs/protocolo.md`](../docs/protocolo.md)), así cada juego solo llena sus pasos. También trae el servidor de cada juego (que lo registra solo en la consola) y la marca común (tema claro/oscuro, logo y cabecera).

---

## Contenido

1. [Partes del SDK](#1-partes-del-sdk)
2. [`GameApp`: la clase base de cada juego](#2-gameapp-la-clase-base-de-cada-juego)
3. [Sellado de eventos para GameStats](#3-sellado-de-eventos-para-gamestats)
4. [Manifiesto del juego (`game.json`)](#4-manifiesto-del-juego-gamejson)
5. [Servidor de cada juego (`game-server`)](#5-servidor-de-cada-juego-game-server)
6. [Tema, marca y cabecera](#6-tema-marca-y-cabecera)
7. [Cómo se construye un juego nuevo](#7-cómo-se-construye-un-juego-nuevo)
8. [Dockerfile plantilla](#8-dockerfile-plantilla)
9. [Patrones](#9-patrones)
10. [Pruebas y comandos](#10-pruebas-y-comandos)

---

## 1. Partes del SDK

| Parte | Dónde | Qué es |
|---|---|---|
| `@gameconsole/sdk` | `src/` | Tipos del protocolo (`protocol.ts`), `GameApp`, `ConsoleChannel` (postMessage), `EventStamper` y `MonotonicClock` |
| `@gameconsole/sdk/theme` | `src/ui/theme.ts` | Tema claro/oscuro, logo y cabecera común (va aparte porque toca el DOM al cargarse) |
| `game-server` | `server/` | Servidor de cada juego en Node (`node:http`, sin dependencias): sirve el juego, publica `game.json` y se registra con latido |
| Ejemplo | `examples/hello/` | El juego más chico posible sobre el SDK |

## 2. `GameApp`: la clase base de cada juego

`GameApp` maneja el protocolo con la consola y el ciclo de vida de la partida. Cada juego **hereda** y llena 5 pasos (patrón Template Method):

| Paso | Cuándo | Qué hace el juego |
|---|---|---|
| `onInit(ctx)` | La consola manda `INIT` | Arma la partida con los jugadores y las opciones. Puede ser asíncrono; `READY` sale cuando termina |
| `onStart()` | `START` | Emite `MATCH_STARTED`, un `PLAYER_JOINED` por jugador y arranca |
| `onPause(reason)` | `PAUSE` (`user` o `hidden`) | Detiene el reloj y emite `MATCH_PAUSED` |
| `onResume()` | `RESUME` | Sigue y emite `MATCH_RESUMED` |
| `onStop(reason)` | `STOP` | Si la partida empezó, emite `PLAYER_LEFT` y `MATCH_FINISHED` |

**Estados** (patrón State): `loading → ready → playing ⇄ paused → finished`. Cada estado decide qué mensajes acepta; los demás se ignoran.

**Reglas que cuida el SDK para que GameStats no rechace nada:**

- solo se emiten eventos con la partida en curso (jugando o en pausa);
- `MATCH_FINISHED` sale una sola vez y, después de él, cualquier otro evento se descarta;
- `FINISHED` (el aviso a la consola) sale una sola vez; si el juego no lo manda al recibir `STOP`, lo manda el SDK;
- si un paso del juego lanza un error, el SDK le avisa a la consola (`ERROR`) en lugar de romperse.

**Lo que el juego puede usar:** `this.emit(evento)`, `this.finish(ganador, motivo)`, `this.error(mensaje, fatal)`. Los tres juntos están en `this.host` (`{ emit, finish, error }`), para pasárselos a la lógica del juego sin que dependa de `GameApp`.

## 3. Sellado de eventos para GameStats

El juego describe el hecho (`type`, `action`, `playerId`, `data`) y el `EventStamper` completa los campos comunes del contrato (patrón Adapter):

| Campo | Cómo |
|---|---|
| `eventId` | `{matchId}-e{n}`, con `n` = 1, 2, 3… por partida |
| `timestamp` | RFC 3339, **estrictamente creciente** (`MonotonicClock`): si dos eventos caen en el mismo milisegundo o el reloj de la PC se atrasa, el siguiente lleva +1 ms |
| `gameId` | `gameStatsId` del manifiesto |
| `gameVersion` | `gameVersion` del manifiesto |
| `matchId` | El que mandó la consola en `INIT` |

`EventStamper.continueFrom(últimoEvento)` sigue la numeración y la hora de una partida: lo usa el EventSender de la consola para el cierre de respaldo.

## 4. Manifiesto del juego (`game.json`)

`GameManifest` (en `protocol.ts`) es la ficha de cada juego. Los campos principales:

| Campo | Qué es |
|---|---|
| `id` | Identificador (`connect4`, `tetris`…): nombre del contenedor `game-{id}` y prefijo del `matchId` |
| `name`, `description`, `icon` | Lo que muestra el menú |
| `gameStatsId`, `gameVersion` | El `gameId` y la versión que van en cada evento |
| `entry` | La dirección que abre la consola en el iframe |
| `players`, `modes` | Cantidad de jugadores y modos (`solo`, `vs-cpu`, `local-2p`) |
| `options` | Opciones que la consola pregunta antes de empezar (por ahora, listas `select`) |
| `howToPlay` | Texto corto con los controles y el objetivo (opcional) |
| `instructions` | "Cómo se juega" por partes (opcional): `goal`, `steps`, `controls` (`[{ keys, action, player? }]`; `"S+F"` = combinación) y `tips`. Si está, la consola lo muestra en secciones que se abren y cierran |

El detalle completo está en la sección 2 de [`docs/protocolo.md`](../docs/protocolo.md).

## 5. Servidor de cada juego (`game-server`)

| Variable | Por defecto | Qué es |
|---|---|---|
| `PORT` | `8080` | Puerto |
| `GAME_DIR` | `./dist` | Carpeta del build del juego; debe tener `game.json` e `index.html` |
| `GAME_BASE` | `/games/{id}/` | Prefijo bajo el que se sirve. El gateway **no quita** el prefijo, así que el juego recibe `/games/{id}/...` completo |
| `REGISTRY_URL` | — | Registry dentro de Docker, por ejemplo `http://registry:8080`. Sin ella, el juego se sirve pero no se registra |

**Rutas:** `GET /health`, `GET {base}game.json`, los archivos de `dist/` bajo `{base}` (los de `assets/` con caché larga) e `index.html` para cualquier ruta sin extensión. `{base}` sin la `/` final redirige a `{base}`.

**Registro automático:**

1. `POST /games` al arrancar (reintenta cada 2 s si el registry todavía no está listo).
2. `PUT /games/{id}/heartbeat` cada 5 s; si da `404`, vuelve a registrarse.
3. `DELETE /games/{id}` al apagarse (`SIGTERM` o `SIGINT`).

## 6. Tema, marca y cabecera

`@gameconsole/sdk/theme` es lo que hace que la consola, el panel y los juegos se vean como un solo producto:

| Exporta | Qué es |
|---|---|
| `BRAND` | El nombre: **DnD Games** |
| `LOGO` | El logo (un adorno navideño en SVG que toma los colores del tema) |
| `appHeader(título, subtítulo, ...botones)` | Cabecera común: logo, nombre y el botón de tema |
| `themeToggle()` | Botón sol / luna para cambiar entre claro y oscuro |
| `initTheme()`, `currentTheme()`, `setTheme()` | El tema se guarda en `localStorage` (`gameconsole-theme`) y se comparte entre todas las apps y pestañas; si nunca se eligió, sigue el del sistema |

## 7. Cómo se construye un juego nuevo

1. `package.json` con `"@gameconsole/sdk": "file:../../sdk"` (desde `games/{id}/`).
2. `vite.config.ts` con `base: "/games/{id}/"`.
3. `public/game.json` con el manifiesto. Vite lo copia a `dist/`.
4. Una clase que hereda de `GameApp`:

```ts
import { GameApp, type MatchContext, type PauseReason, type StopReason } from "@gameconsole/sdk";

class MiJuego extends GameApp {
  protected onInit(ctx: MatchContext) { /* armar la partida (puede ser async) */ }
  protected onStart() { this.emit({ type: "MATCH_STARTED", data: {} }); /* PLAYER_JOINED… */ }
  protected onPause(reason: PauseReason) { this.emit({ type: "MATCH_PAUSED", data: { reason } }); }
  protected onResume() { this.emit({ type: "MATCH_RESUMED", data: {} }); }
  protected onStop(reason: StopReason) { /* PLAYER_LEFT, MATCH_FINISHED y this.finish(null, "stopped") */ }
}

new MiJuego({ manifest: { id: "mijuego", gameStatsId: "mijuego", gameVersion: "1.0" } }).listen();
```

5. Su `Dockerfile` (la plantilla de abajo) y su servicio `game-{id}` en `docker-compose.yml` con `REGISTRY_URL`.

Con eso, **el juego aparece solo en la consola**: no hay que tocar ni la consola ni el gateway. Ejemplo completo: [`examples/hello/`](examples/hello/).

## 8. Dockerfile plantilla

Se construye **desde la raíz del repo** (para que Docker vea `sdk/`); el `.dockerignore` de la raíz deja fuera `node_modules`, `dist` y `dist-server`. En `docker-compose.yml`:

```yaml
game-mijuego:
  build: { context: ., dockerfile: games/mijuego/Dockerfile }
  environment:
    REGISTRY_URL: "http://registry:8080"
```

```dockerfile
# 1) El SDK: pruebas y compilación del servidor.
FROM node:22-alpine AS sdk
WORKDIR /repo/sdk
COPY sdk/package.json sdk/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY sdk/tsconfig.json sdk/tsconfig.server.json sdk/vitest.config.ts ./
COPY sdk/src ./src
COPY sdk/server ./server
COPY sdk/test ./test
RUN npm test && npm run build

# 2) El juego, con el SDK en ../../sdk.
FROM node:22-alpine AS build
COPY --from=sdk /repo/sdk /repo/sdk
WORKDIR /repo/games/mijuego
COPY games/mijuego/package.json games/mijuego/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY games/mijuego/ ./
RUN npm test && npm run build

# 3) Lo que corre: Node, el servidor del SDK y el build del juego.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 GAME_DIR=/app/dist
COPY --from=sdk /repo/sdk/dist-server ./server
COPY --from=build /repo/games/mijuego/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/main.js"]
```

`dist-server/` lleva su propio `package.json` con `"type": "module"` (lo escribe `npm run build`), así `server/main.js` corre solo con Node, sin copiar nada más del SDK.

## 9. Patrones

| Patrón | Dónde | Para qué |
|---|---|---|
| **Template Method** | `GameApp` | El SDK define el ciclo; cada juego llena sus 5 pasos |
| **State** | `client/states.ts` | Qué mensaje vale en cada estado de la partida |
| **Adapter** | `EventStamper` | Completa cada evento con los campos del contrato de GameStats |
| **Observer** | `ConsoleChannel` | El juego escucha los mensajes de la consola sin saber de `postMessage` |

## 10. Pruebas y comandos

```bash
npm ci
npm run build   # revisa tipos y compila server/ a dist-server/
npm test        # 82 pruebas
```

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `gameapp.test.ts` | 32 | Ciclo de vida, estados, reglas de emisión, errores de los pasos |
| `channel.test.ts` | 14 | Mensajes con la consola: origen, `matchId`, formato |
| `events.test.ts` | 9 | `eventId`, timestamps estrictamente crecientes, `continueFrom` |
| `uuid.test.ts` | 2 | `newUuid`: usa `crypto.randomUUID` si existe y, si no (página abierta por `http://<IP>`), arma un UUID v4 válido |
| `server/game-server.test.ts` | 15 | Rutas, prefijo, `game.json`, `/health` |
| `server/registry-client.test.ts` | 10 | Registro, latido, reintentos y baja al apagarse |
