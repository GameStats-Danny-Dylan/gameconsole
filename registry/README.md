# Registry: descubrimiento automático de juegos

Cada juego **se registra solo** al arrancar (manda su manifiesto) y después manda un **latido cada 5 s**. Si pasa **15 s sin latir**, sale de la lista. La consola pide la lista y arma el menú sin conocer los juegos de antemano: agregar un juego nuevo es levantar su contenedor.

El contrato está en [`docs/protocolo.md`](../docs/protocolo.md#3-registry-descubrimiento-automático) (secciones 2 y 3).

| Método | Ruta interna | Por nginx | Qué hace |
|---|---|---|---|
| `POST` | `/games` | `/api/registry/games` | Registra o actualiza (cuerpo: el manifiesto) → `201`, o `400` con el motivo |
| `PUT` | `/games/{id}/heartbeat` | `/api/registry/games/{id}/heartbeat` | Latido → `204`, o `404` (el juego debe registrarse otra vez) |
| `DELETE` | `/games/{id}` | `/api/registry/games/{id}` | Se va de la lista → `204` o `404` |
| `GET` | `/games` | `/api/registry/games` | Juegos vivos con `registeredAt` y `lastSeen` |
| `GET` | `/health` | `/api/registry/health` | `{"status":"ok","games":N}` |

## Archivos

| Archivo | Qué tiene |
|---|---|
| `src/manifest.ts` | El tipo `GameManifest` y su validación (`validateManifest`) |
| `src/registry.ts` | `GameRegistry`: la lista de juegos vivos y los avisos `registered` / `removed` / `expired` |
| `src/server.ts` | Las rutas HTTP con `node:http`, sin framework |
| `src/main.ts` | Arranque, variables de entorno y log |
| `test/` | 15 pruebas con `node:test` |

**Patrones:** *Registry* (un solo lugar donde los juegos se anotan y la consola los busca) y *Observer* (`GameRegistry` es un `EventEmitter`; el log se suscribe a sus avisos sin que la clase sepa quién escucha).

## Cómo correrlo

```bash
npm install
npm test          # compila y corre las pruebas
npm run build && npm start
```

| Variable | Por defecto | Qué es |
|---|---|---|
| `PORT` | `8080` | Puerto |
| `HEARTBEAT_TIMEOUT_MS` | `15000` | Sin latido durante este tiempo, el juego se considera caído |

Con Docker: `docker build -t gameconsole-registry . ; docker run -p 8090:8080 gameconsole-registry`
