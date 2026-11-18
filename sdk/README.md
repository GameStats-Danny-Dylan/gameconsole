# SDK de GameConsole

Implementa una sola vez el protocolo de [`docs/protocolo.md`](../docs/protocolo.md) para que cada juego solo llene sus pasos.

| Parte | Qué es |
|---|---|
| `@gameconsole/sdk` (`src/`) | Tipos del protocolo, `GameApp` (Template Method + State), `ConsoleChannel` (postMessage), `EventStamper` y `MonotonicClock` (timestamps estrictamente crecientes) |
| `@gameconsole/sdk/theme` | Tema claro / oscuro y encabezado común (va aparte porque toca el DOM al cargarse) |
| `game-server` (`server/`) | Servidor de cada juego en Node (`node:http`, sin dependencias): sirve el build bajo `GAME_BASE`, `/health` y `game.json`, y hace el registro con latido en el registry |

```bash
npm install
npm run build   # revisa tipos y compila server/ a dist-server/
npm test        # Vitest
```

## Variables de entorno de `game-server`

| Variable | Por defecto | Qué es |
|---|---|---|
| `PORT` | `8080` | Puerto |
| `GAME_DIR` | `./dist` | Carpeta del build del juego; debe tener `game.json` e `index.html` |
| `GAME_BASE` | `/games/{id}/` (con el `id` de `game.json`) | Prefijo bajo el que se sirve. El gateway **no quita** el prefijo, así que el juego recibe `/games/{id}/...` completo |
| `REGISTRY_URL` | — | Registry dentro de Docker, por ejemplo `http://registry:8080`. Sin ella, el juego se sirve pero no se registra |

Rutas: `GET /health`, `GET {base}game.json`, los archivos de `dist/` bajo `{base}` (los de `assets/` con caché larga), y `index.html` para cualquier ruta sin extensión. `{base}` sin la `/` final redirige a `{base}`.

Registro: `POST /games` al arrancar (reintenta cada 2 s si el registry no está listo), `PUT /games/{id}/heartbeat` cada 5 s, un nuevo `POST` si el latido da `404`, y `DELETE /games/{id}` al recibir `SIGTERM` o `SIGINT`.

## Cómo se construye un juego

1. `package.json` con `"@gameconsole/sdk": "file:../../sdk"` (desde `games/{id}/`).
2. `vite.config.ts` con `base: "/games/{id}/"`.
3. `public/game.json` con el manifiesto (sección 2 del protocolo). Vite lo copia a `dist/`.
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

`this.host` es `{ emit, finish, error }`, para pasárselo a la lógica del juego sin que dependa de `GameApp`. Ejemplo completo: [`examples/hello/`](examples/hello/).

## Dockerfile plantilla

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
