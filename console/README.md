# Consola

La página principal de GameConsole (`/`). Muestra los juegos disponibles, arma cada partida, la abre en un iframe y manda sus eventos a GameStats. No conoce ningún juego de antemano: los saca del registry.

## Contenido

- [Qué hace](#qué-hace)
- [Cómo está armada](#cómo-está-armada)
- [Ciclo de una partida](#ciclo-de-una-partida)
- [Envío de eventos (EventSender)](#envío-de-eventos-eventsender)
- [Usabilidad: heurísticas de Nielsen](#usabilidad-heurísticas-de-nielsen)
- [Patrones](#patrones)
- [Cómo correrla](#cómo-correrla)

## Qué hace

1. **Guía de primera vez:** qué es GameConsole y cómo usarla en 3 pasos. Sale sola la primera vez; después, con el botón **? Guía**.
2. **Catálogo:** pide al registry los juegos vivos cada 10 s y arma el menú. Si un juego se cae, sale del menú; sus partidas abiertas siguen. Cada tarjeta muestra **en vivo lo que dice GameStats** de ese juego: partidas en curso, partidas jugadas y quién va ganando (`LiveStats`, cada 5 s).
3. **Nueva partida (panel lateral):** muestra **"Cómo se juega"** (el `howToPlay` del `game.json`, con las teclas resaltadas) y el formulario, que se genera desde el manifiesto (modos, jugadores y opciones). Los nombres son obligatorios, distintos entre sí y nunca `cpu`. No es modal: las partidas abiertas se corren a un lado y **siguen jugándose**.
4. **Partidas:** cada una corre en su propio iframe, con `matchId = {juego}-{uuid}`, y tiene sus botones: Pausar/Reanudar, Reiniciar, Nueva partida y Cerrar. Se pueden abrir varias a la vez, y también en varias pestañas.
5. **Pausa automática:** si una partida deja de verse (pestaña oculta, fuera de pantalla), se pausa. Al volver no se reanuda sola: se resalta "Reanudar".
6. **Estadísticas integradas (panel lateral):** el botón **Estadísticas** abre el panel de GameStats dentro de la consola, al lado de las partidas, así se ve cómo cambian las estadísticas mientras se juega. Es la app del panel (`/panel/`) en un iframe, sin duplicar código; también se puede abrir aparte.
7. **Envío de eventos:** todo lo que emiten los juegos se manda a GameStats con el `EventSender`. La cabecera muestra si está al día, enviando o reintentando.

## Cómo está armada

| Carpeta | Archivos | Qué hacen |
|---|---|---|
| `catalog/` | `GameCatalog`, `RegistryClient`, `LiveStats` | La lista de juegos vivos (registry) y lo que dice GameStats de cada uno |
| `domain/` | `MatchSetup`, `MatchContextFactory`, `players` | Las opciones y los nombres de una partida; arma el `INIT` |
| `match/` | `MatchSession`, `sessionStates`, `MatchMediator`, `MatchSessionFactory`, `MatchFrame`, `EventBus` | Cada partida, sus estados, el reparto de mensajes de los iframes y el bus de eventos |
| `sending/` | `EventSender`, `EventTransport`, `RetryPolicy` | El envío de eventos a GameStats |
| `ui/` | `ConsoleShell`, `WelcomeGuide`, `GameMenu`, `MatchFormView`, `StatsDrawer`, `MatchGrid`, `MatchTile`, `SendIndicator`, `VisibilityWatcher` | La pantalla |

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

## Usabilidad: heurísticas de Nielsen

La consola está pensada para alguien que la abre por primera vez. Se revisó contra las 10 heurísticas de Nielsen:

| # | Heurística | Cómo se cumple |
|---|---|---|
| 1 | Visibilidad del estado del sistema | Cabecera con el estado de los juegos ("En línea · 3 juegos") y del envío a GameStats ("al día", "enviando", "no responde"). Cada partida muestra su estado (Cargando, Jugando, En pausa, Terminada). Avisos breves al abrir una partida, cuando alguien gana o si GameStats deja de responder. Las tarjetas muestran partidas en curso en vivo |
| 2 | Relación con el mundo real | Todo en español y con palabras de jugador: "Cómo se juega", "Computadora", "En las estadísticas aparecerás como…". Nada de términos internos en la pantalla |
| 3 | Control y libertad | Los paneles laterales se cierran con ✕, "Cancelar" o Esc. Pausar/Reanudar, Reiniciar, Nueva partida y Cerrar en cada partida |
| 4 | Consistencia y estándares | Los mismos botones, colores y tema claro/oscuro en la consola, los juegos y el panel. El botón principal siempre es el de color |
| 5 | Prevención de errores | Nombres obligatorios, distintos y validados al escribir. Cerrar o reiniciar una partida en curso pide confirmar en el mismo botón ("¿Cerrar? Sí"), sin ventanas emergentes |
| 6 | Reconocer en vez de recordar | "Cómo se juega" antes de empezar y también durante la partida (botón "? Cómo se juega"), con las teclas dibujadas. Si la partida no tiene el teclado, se avisa cómo dárselo; la partida nueva lo recibe sola |
| 7 | Flexibilidad y eficiencia | Teclado en los juegos, Esc para cerrar paneles, Reiniciar juega otra igual sin volver a llenar el formulario, varias partidas a la vez |
| 8 | Diseño estético y minimalista | Una tarjeta por juego con lo justo; la guía y los paneles se abren solo cuando se piden |
| 9 | Reconocer, diagnosticar y recuperarse de errores | Los mensajes dicen qué pasó y qué hacer ("El juego no respondió a tiempo. Pulsa «Reintentar»"). Si GameStats no responde, se avisa que no se pierde nada y se reintenta solo |
| 10 | Ayuda y documentación | Guía de primera vez en 3 pasos (botón "? Guía"), "Cómo se juega" de cada juego y explicaciones al pasar el mouse sobre los indicadores |

## Patrones

| Patrón | Dónde |
|---|---|
| Observer | `EventBus`: las sesiones publican, el `EventSender` y la pantalla escuchan. `LiveStats` avisa a las tarjetas del menú |
| Mediator | `MatchMediator`: reparte los mensajes de todos los iframes |
| State | `sessionStates`: qué se puede hacer en cada estado de la partida |
| Factory | `MatchSessionFactory`, `MatchContextFactory` |
| Strategy | `RetryPolicy` / `BackoffPolicy` |
| Facade | `ConsoleShell`: `main.ts` solo llama a `mount()` |
| Singleton | `GameCatalog.instance()` |

## Cómo correrla

```bash
npm ci
npm test         # 107 pruebas
npm run build
npm run dev      # en desarrollo; necesita el gateway (docker compose) para /api y /games
```

Con Docker se construye desde la **raíz** del repo, porque usa el SDK: `docker build -f console/Dockerfile .`
