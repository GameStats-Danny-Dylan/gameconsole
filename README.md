# GameConsole

Consola web para jugar varios juegos a la vez, con sus estadísticas en vivo. Es la **continuación de [GameStats](https://github.com/Danny7w7-coder/gamestats)** (Proyecto 1): allá un simulador generaba las partidas; aquí las generan juegos de verdad, y GameStats las analiza.

- **Juegos independientes:** cada juego es una app propia, con su contenedor y su manifiesto (`game.json`). La consola no conoce los juegos de antemano: los **descubre sola** porque cada juego se registra al arrancar.
- **Varias partidas a la vez:** cada partida corre en su propio iframe, en la misma consola o en pestañas distintas, y manda sus eventos sin frenar a las demás.
- **IA en Prolog:** el 4 en línea contra la computadora decide con minimax y poda alfa-beta.
- **Panel en vivo:** muestra las estadísticas que calcula GameStats, por juego y en general, mientras se juega.

> Estado: en desarrollo (entrega: 20 de noviembre de 2026). Lo que falta está en [Pendientes](#pendientes).

## Arquitectura

```
                      navegador
   ┌──────────────────────────────────────────────┐
   │ consola ── iframe: /games/connect4/  (partida 1)
   │         ── iframe: /games/tetris/    (partida 2)    panel: /panel/
   └───────────────────────┬──────────────────────┘
                           │ un solo origen
                     ┌─────▼─────┐
                     │  gateway  │ nginx: la única puerta de entrada
                     └─────┬─────┘
      ┌──────────┬─────────┼──────────┬───────────┬──────────────────┐
  console    game-{id}   panel     registry     prolog      GameStats (P1)
  (Dylan)   un contenedor          juegos       IA 4 en     ingestion (Go) → analytics (Scala)
            por juego              vivos        línea       /api/events      /api/stats, /api/results
```

| Carpeta | Qué es | Tecnología |
|---|---|---|
| [`gateway/`](gateway/) | Puerta de entrada: rutas a cada servicio y a cada juego (`/games/{id}/` → contenedor `game-{id}`) | nginx |
| [`registry/`](registry/) | Descubrimiento de juegos: registro, latido cada 5 s, fuera a los 15 s | Node + TypeScript |
| [`prolog/`](prolog/) | IA del 4 en línea: `POST /api/ai/connect4/move` | SWI-Prolog |
| [`games/connect4/`](games/connect4/) | 4 en línea: contra la computadora o 2 personas | TypeScript + Vite |
| [`panel/`](panel/) | Panel de estadísticas | TypeScript + Vite |
| `console/`, `sdk/`, `games/tetris/`, `games/fighting/` | Consola, SDK del protocolo, Tetris y peleas | TypeScript + Vite (Dylan) |
| [`docs/protocolo.md`](docs/protocolo.md) | El contrato entre todas las piezas | — |

GameStats no se compila aquí: se usan sus imágenes publicadas (`ghcr.io/danny7w7-coder/gamestats-*`).

## Cómo correrlo

Solo hace falta Docker.

```bash
docker compose up -d --build --wait     # todo, en http://localhost:8000
bash scripts/smoke.sh                   # prueba de humo (opcional; necesita curl y jq)
docker compose down                     # apagar (los resultados se conservan)
```

| Dirección | Qué hay |
|---|---|
| <http://localhost:8000/panel/> | Panel de estadísticas |
| <http://localhost:8000/games/connect4/> | 4 en línea (modo de prueba, sin consola) |
| <http://localhost:8000/api/registry/games> | Juegos registrados ahora |

**Con las imágenes publicadas** (sin compilar nada): `docker compose -f docker-compose.deploy.yml up -d --wait`.

**Para que otros entren desde su computadora:** `docker compose --profile tunnel up -d` levanta un túnel de Cloudflare; la URL pública (`https://….trycloudflare.com`) aparece en `docker compose logs tunnel`. Funciona mientras la PC que lo levantó esté encendida.

| Variable | Por defecto | Qué es |
|---|---|---|
| `GATEWAY_PORT` | `8000` | Puerto de la PC donde se publica todo |
| `GAMESTATS_TAG` | `v1.0` | Versión de las imágenes de GameStats |
| `ANALYTICS_IMAGE`, `INGESTION_IMAGE` | las de GHCR | Para probar una versión local de GameStats sin publicarla |
| `GAMECONSOLE_TAG` | `latest` | Versión de las imágenes de GameConsole (solo `docker-compose.deploy.yml`) |

## CI/CD

| Workflow | Cuándo | Qué hace |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Cada push y PR | Pruebas de cada app (registry, panel, 4 en línea, Prolog) y validación de nginx |
| [`cd.yml`](.github/workflows/cd.yml) | PR a `main`: solo integración. Push a `main` o tag `v*`: todo | 1) levanta todo con docker compose, corre la prueba de humo y manda partidas del 4 en línea a GameStats (Scala no puede descartar ningún evento); 2) publica las imágenes en `ghcr.io/gamestats-danny-dylan/gameconsole-*` (amd64 y arm64); 3) levanta `docker-compose.deploy.yml` con las imágenes descargadas y repite la prueba |

## Decisiones técnicas

- **Un repo, apps independientes.** Cada juego es una carpeta con su Dockerfile, su contenedor y su manifiesto. Agregar un juego es agregar su servicio al compose: ni la consola ni nginx cambian.
- **Todo por un solo origen (nginx).** Sin CORS, sin `localhost` en el código, y el mismo compose sirve en una PC, detrás del túnel o en un servidor.
- **GameStats no se recalcula.** El panel solo muestra lo que devuelve GameStats. Para eso GameStats v1.1 agrega `/stats/overview`, `/stats/games/{id}` y `/games`, y acepta cualquier `gameId`.
- **Eventos que pasan las reglas de GameStats.** El 4 en línea se prueba con 3000 partidas al azar contra una copia de las reglas de contexto de Scala, y en el CD contra GameStats real.

| Patrón | Dónde |
|---|---|
| Adapter | Hechos de cada juego → contrato de eventos de GameStats (`GameStatsAdapter`) |
| Observer | Hechos de la partida (`Connect4Match.facts`), avisos del registry (`GameRegistry`), fotos del panel (`PanelStore`) |
| Command | Fichas del 4 en línea, con deshacer |
| Strategy | Cómo elige jugada la computadora (`MoveStrategy` / `PrologStrategy`) |
| State | Ciclo de vida de una partida (`loading → ready → playing ⇄ paused → finished`) |
| Facade | `GameStatsClient` del panel |
| Proxy | `PrologStrategy` (red, tiempo límite y reintentos) y el gateway |
| Registry | `GameRegistry`: dónde se anotan los juegos |
| Template Method | `GameApp` del SDK (Dylan) |

## Pendientes

- Consola, SDK (`sdk/` y `sdk/server`), Tetris y peleas (Dylan).
- Conectar el 4 en línea al SDK (`Connect4App extends GameApp`) y reemplazar su servidor provisional por `sdk/server`.
- GameStats v1.1 publicado (`/games` y tiempo de espera por juego en Go; Scala ya está listo).
- Video de demostración.
