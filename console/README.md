# Consola

La página principal de GameConsole (`/`). Muestra los juegos disponibles, arma cada partida, la abre en un iframe y manda sus eventos a GameStats. No conoce ningún juego de antemano: los saca del registry.

## Contenido

- [Qué hace](#qué-hace)
- [Cómo está armada](#cómo-está-armada)
- [Ciclo de una partida](#ciclo-de-una-partida)
- [Envío de eventos (EventSender)](#envío-de-eventos-eventsender)
- [Patrones](#patrones)
- [Cómo correrla](#cómo-correrla)

## Qué hace

1. **Catálogo:** pide al registry los juegos vivos cada 10 s y arma el menú. Si un juego se cae, sale del menú; sus partidas abiertas siguen.
2. **Formulario de partida:** se genera desde el `game.json` del juego (modos, cantidad de jugadores y opciones). Los nombres son obligatorios, distintos entre sí y nunca `cpu`.
3. **Partidas:** cada una corre en su propio iframe, con `matchId = {juego}-{uuid}`. Se pueden abrir varias a la vez, y también en varias pestañas.
4. **Pausa automática:** si una partida deja de verse (pestaña oculta, fuera de pantalla), se pausa. Al volver no se reanuda sola: se resalta "Reanudar".
5. **Envío de eventos:** todo lo que emiten los juegos se manda a GameStats con el `EventSender`. La cabecera muestra si está al día, enviando o reintentando.

## Cómo está armada

| Carpeta | Archivos | Qué hacen |
|---|---|---|
| `catalog/` | `GameCatalog`, `RegistryClient` | La lista de juegos vivos, consultada al registry |
| `domain/` | `MatchSetup`, `MatchContextFactory`, `players` | Las opciones y los nombres de una partida; arma el `INIT` |
| `match/` | `MatchSession`, `sessionStates`, `MatchMediator`, `MatchSessionFactory`, `MatchFrame`, `EventBus` | Cada partida, sus estados, el reparto de mensajes de los iframes y el bus de eventos |
| `sending/` | `EventSender`, `EventTransport`, `RetryPolicy` | El envío de eventos a GameStats |
| `ui/` | `ConsoleShell`, `GameMenu`, `MatchFormView`, `MatchGrid`, `MatchTile`, `SendIndicator`, `VisibilityWatcher` | La pantalla |

## Ciclo de una partida

```
iframe carga ──INIT──► juego listo (READY) ──START──► jugando ⇄ en pausa ──STOP──► terminada
```

- La consola manda `INIT` con el `matchId`, los jugadores y las opciones; con `READY` manda `START`.
- Sin `READY` en 10 s, la partida se cierra con error. Después de `STOP`, si el juego no responde `FINISHED` en 2 s, se cierra igual.
- Al cerrarse, la sesión avisa por el bus (`closed`) y el `EventSender` completa lo que falte.
- Cada iframe solo puede hablar por su propia partida: `MatchMediator` comprueba el origen, la ventana y el `matchId` de cada mensaje.

## Envío de eventos (EventSender)

Protocolo, [sección 6](../docs/protocolo.md#6-eventsender).

| Qué | Cómo |
|---|---|
| Separación | Una cola por partida: una partida no frena a otra y no se mezclan eventos |
| Lotes | `POST /api/events` cada 500 ms o al juntar 20 eventos |
| Orden | En el orden en que se generaron; nunca dos envíos de la misma partida a la vez |
| Fallos | Error de red o 5xx: reintenta a los 1, 2, 4 y 8 s, y después cada 8 s, sin perder eventos. 4xx o evento rechazado: se avisa en la consola del navegador y no se reintenta |
| Partida cerrada sin terminar | Cierre de respaldo: `PLAYER_LEFT` por cada persona y `MATCH_FINISHED` sin `data`, solo si hubo `MATCH_STARTED` y no hubo `MATCH_FINISHED`. Sigue la numeración y la hora de la partida (`EventStamper.continueFrom`) |
| Pestaña cerrada | Lo pendiente y los cierres salen con `navigator.sendBeacon`; el envío en curso termina solo (`keepalive`) |

## Patrones

| Patrón | Dónde |
|---|---|
| Observer | `EventBus`: las sesiones publican, el `EventSender` y la pantalla escuchan |
| Mediator | `MatchMediator`: reparte los mensajes de todos los iframes |
| State | `sessionStates`: qué se puede hacer en cada estado de la partida |
| Factory | `MatchSessionFactory`, `MatchContextFactory` |
| Strategy | `RetryPolicy` / `BackoffPolicy` |
| Facade | `ConsoleShell`: `main.ts` solo llama a `mount()` |
| Singleton | `GameCatalog.instance()` |

## Cómo correrla

```bash
npm ci
npm test         # 104 pruebas
npm run build
npm run dev      # en desarrollo; necesita el gateway (docker compose) para /api y /games
```

Con Docker se construye desde la **raíz** del repo, porque usa el SDK: `docker build -f console/Dockerfile .`
