# Gateway (nginx)

La única puerta de entrada de DnD Games (repo `gameconsole`): es el único servicio con un puerto publicado (`GATEWAY_PORT`, por defecto `8000`). Todo lo demás se habla por la red interna de Docker.

## Contenido

- [Rutas](#rutas)
- [Cómo funciona](#cómo-funciona)
- [Archivos](#archivos)

## Rutas

| Ruta pública | Va a | Ruta interna |
|---|---|---|
| `/` | `console:8080` | igual |
| `/games/{id}/` | `game-{id}:8080` | igual (el juego se sirve con el prefijo) |
| `/panel/` | `panel:8080` | igual |
| `/api/events`, `/api/matches`, `/api/games` | `ingestion:8080` (Go) | `/events`, `/matches`, `/games` |
| `/api/stats/…`, `/api/results…`, `/api/players/…` | `analytics:8081` (Scala) | sin `/api` |
| `/api/registry/…` | `registry:8080` | sin `/api/registry` |
| `/api/ai/…` | `prolog:8080` | sin `/api/ai` |
| `/health` | el propio gateway | — |

## Cómo funciona

- **Juegos sin tocar nginx:** `/games/{id}/` va al contenedor `game-{id}`, que Docker encuentra por su nombre. Un juego nuevo solo necesita su servicio en el compose.
- **Arranca aunque falte algo:** los destinos se resuelven al momento de cada pedido (`resolver 127.0.0.11`). Si un servicio no está, responde `503` con un aviso en lugar de no arrancar.
- **Un solo origen:** la consola, los juegos, el panel y las APIs comparten dirección, así que no hace falta CORS y el código no tiene `localhost` escrito.

## Archivos

| Archivo | Qué es |
|---|---|
| `default.conf` | Las rutas |
| `Dockerfile` | nginx 1.28 con la configuración; valida con `nginx -t` al construir |
