# 4 en línea

El juego de **usuario contra computadora** de DnD Games: conecta 4 fichas de tu color antes que tu rival. La computadora decide cada jugada con una **IA en Prolog**. También se puede jugar entre 2 personas en la misma pantalla.

Es una app independiente: tiene su propio contenedor (`game-connect4`), se registra sola en la consola y manda sus eventos a GameStats con el contrato del Proyecto 1.

---

## Contenido

1. [Cómo se juega](#1-cómo-se-juega)
2. [Modos y opciones](#2-modos-y-opciones)
3. [La computadora (IA en Prolog)](#3-la-computadora-ia-en-prolog)
4. [Arquitectura](#4-arquitectura)
5. [Programación orientada a objetos](#5-programación-orientada-a-objetos)
6. [Patrones de diseño](#6-patrones-de-diseño)
7. [Ciclo de una partida](#7-ciclo-de-una-partida)
8. [Eventos para GameStats](#8-eventos-para-gamestats)
9. [Manifiesto (`game.json`)](#9-manifiesto-gamejson)
10. [Modo de prueba (sin la consola)](#10-modo-de-prueba-sin-la-consola)
11. [Pruebas](#11-pruebas)
12. [Cómo correrlo](#12-cómo-correrlo)

---

## 1. Cómo se juega

**Objetivo:** conectar 4 fichas de tu color seguidas, en horizontal, vertical o diagonal, antes que tu rival.

1. El tablero tiene **7 columnas y 6 filas**.
2. Los jugadores se turnan. En cada turno sueltas una ficha en una columna y cae hasta el espacio libre más bajo.
3. Gana el primero que junte 4 en línea. Si el tablero se llena sin 4 en línea, es **empate**.
4. Empieza el jugador 1 (fichas rojas). La computadora juega con las amarillas.

**Controles**

| Tecla / acción | Qué hace |
|---|---|
| Clic en una columna, o teclas **1** a **7** | Soltar una ficha en esa columna |
| **P** | Pedir una pista: la IA sugiere una columna (hasta 3 por partida) |
| **U** | Deshacer tu última jugada (solo contra la computadora) |

**Ayudas**

- **Pista:** la IA calcula la mejor columna con la dificultad más alta y la marca en el tablero. Hay 3 por partida.
- **Deshacer:** contra la computadora, quita tu última ficha y la respuesta de la computadora, así vuelve a ser tu turno.
- **Tiempo por turno** (opcional): si se acaba, pierdes el turno y juega el rival.

## 2. Modos y opciones

| Modo | Jugadores | Detalle |
|---|---|---|
| **Contra la computadora** (`vs-cpu`) | 1 persona + la computadora | La IA en Prolog decide cada jugada |
| **2 personas** (`local-2p`) | 2 personas en la misma pantalla | Se turnan en el mismo tablero |

| Opción | Valores | Por defecto |
|---|---|---|
| Dificultad (solo contra la computadora) | Fácil, Media, Difícil | Media |
| Tiempo por turno | Sin límite, 15 s, 30 s, 60 s | Sin límite |

Los nombres son obligatorios, distintos entre sí y no pueden ser "cpu" (está reservado para la computadora).

## 3. La computadora (IA en Prolog)

En cada turno de la computadora, el juego manda a Prolog el tablero, el color que mueve y la dificultad (`POST /api/ai/connect4/move`), y suelta la ficha en la columna que recibe. Prolog busca con **minimax (negamax) y poda alfa-beta**. El detalle del algoritmo está en [`prolog/README.md`](../../prolog/README.md).

| Dificultad | Jugadas que mira | Cómo juega | Contra un jugador "casual" simulado, la computadora gana… |
|---|---|---|---|
| Fácil | 1 | Juega al centro y arma alguna línea; gana si ve el 4 en línea, pero nunca tapa | ~15 % |
| Media | 1 | A la defensiva: tapa tus líneas de 3, pero no arma las suyas ni planea | ~50 % |
| Difícil | 3 | Tapa, arma amenazas dobles y no cae en trampas cortas | ~85 % |

**Cómo lo usa el juego** (`src/ai/MoveStrategy.ts`):

- `PrologStrategy` hace el pedido con un tiempo límite de 10 s y reintenta 2 veces si falla la red. Un `400` (pedido inválido) no se reintenta.
- `MinThinkTime` hace que la computadora "piense" al menos 0,7 s, para que la ficha no aparezca de golpe en fácil y media.
- Si Prolog no responde, el juego avisa "La computadora no responde; se vuelve a intentar…" y reintenta cada 3 s sin trabar la partida.
- La decisión de la IA viaja a GameStats en `data.ai` del `DISC_DROPPED` de la computadora (ver la [sección 8](#8-eventos-para-gamestats)).

## 4. Arquitectura

```
src/
  domain/
    Board.ts              tablero inmutable: soltar ficha, 4 en línea, amenazas
    Connect4Match.ts      reglas de la partida: turnos, amenazas, ganador, empate, deshacer
  adapter/
    GameStatsAdapter.ts   hechos del juego -> eventos del contrato de GameStats
  ai/
    MoveStrategy.ts       cómo elige columna la computadora (PrologStrategy, MinThinkTime)
  game/
    Connect4App.ts        el juego dentro de la consola (hereda de GameApp del SDK)
    Connect4Game.ts       controlador: une reglas, IA, vista y consola
    ports.ts              interfaces: GameHost, MatchContext, Connect4View
  ui/
    DomBoardView.ts       dibujo con HTML/CSS y teclado
  standalone/
    setup.ts              modo de prueba con formulario propio
    StandaloneHost.ts     envío directo a /api/events en el modo de prueba
  main.ts                 dentro de la consola: Connect4App; abierto solo: modo de prueba
public/
  game.json               manifiesto del juego
```

**Cómo se conectan las piezas:**

```
consola ──INIT/START/PAUSE/RESUME/STOP──► Connect4App (SDK) ──► Connect4Game
                                                                  │  ├─► Connect4Match (reglas) ──hechos──► GameStatsAdapter ──► GameHost.emit ──► consola ──► GameStats
                                                                  │  ├─► MoveStrategy (Prolog)
                                                                  │  └─► DomBoardView (dibujo y teclado)
```

## 5. Programación orientada a objetos

| Concepto | Dónde se ve |
|---|---|
| **Clases con una sola responsabilidad** | `Board` no sabe de turnos; `Connect4Match` no sabe de pantallas ni de red; `DomBoardView` no toca las reglas; `Connect4Game` solo coordina |
| **Encapsulación** | `Board` es inmutable: soltar una ficha devuelve un tablero nuevo. El estado de la partida solo cambia por sus métodos (`drop`, `undo`, `timeout`, `hint`) |
| **Abstracción** | `Connect4Game` depende de interfaces (`GameHost`, `Connect4View`, `MoveStrategy`), no de clases concretas. Por eso se prueba con versiones falsas, sin navegador ni red |
| **Herencia** | `Connect4App extends GameApp`: el SDK maneja el protocolo y el juego llena sus pasos |
| **Polimorfismo** | `PrologStrategy` y `MinThinkTime` implementan la misma interfaz `MoveStrategy`; el juego no sabe cuál usa |

## 6. Patrones de diseño

| Patrón | Dónde | Para qué |
|---|---|---|
| **Adapter** | `GameStatsAdapter` | Traduce "cayó una ficha en (4, 2)" a `PLAYER_ACTION DISC_DROPPED {column: 4, row: 2}` |
| **Observer** | `Connect4Match.facts` | La partida publica sus hechos; el adapter se suscribe sin que la partida lo conozca |
| **Command** | `DropCommand` en `Connect4Match` | Cada ficha guarda cómo estaba la partida antes: deshacer es volver a ese estado |
| **Strategy** | `MoveStrategy` / `PrologStrategy` | Cómo elige columna la computadora; en las pruebas, una IA falsa |
| **Decorator** | `MinThinkTime` | Agrega una espera mínima sin cambiar la estrategia que envuelve |
| **Proxy** | `PrologStrategy` | El juego pide una jugada como si fuera local; la clase se encarga de la red, el tiempo límite y los reintentos |
| **State** | `Connect4Game` | Cada mensaje de la consola solo vale en ciertos estados de la partida |
| **Template Method** | `Connect4App extends GameApp` | El SDK define el ciclo; el juego llena `onInit`, `onStart`, `onPause`, `onResume`, `onStop` |

## 7. Ciclo de una partida

```
loading ──INIT──► ready ──START──► playing ⇄ paused ──► finished
```

| Mensaje de la consola | Qué hace el juego |
|---|---|
| `INIT` | Arma la partida (jugadores, dificultad, tiempo por turno) y dibuja el tablero |
| `START` | Emite `MATCH_STARTED` y un `PLAYER_JOINED` por jugador; empieza el jugador 1 |
| `PAUSE` | Detiene el reloj; si la IA estaba pensando, guarda su jugada para cuando se reanude |
| `RESUME` | Sigue donde quedó |
| `STOP` | Si la partida empezó, emite `PLAYER_LEFT` de cada persona y `MATCH_FINISHED` (sin ganador) |

Cuando alguien gana o hay empate, emite `MATCH_FINISHED` y avisa a la consola (`FINISHED`) con el ganador.

## 8. Eventos para GameStats

Usa las acciones del 4 en línea que GameStats ya conocía desde el Proyecto 1, con el mismo contrato (`eventId`, `timestamp`, `gameId`, `gameVersion`, `matchId`, `playerId`, `type`, `action`, `data`). El SDK completa los campos comunes; el juego pone `type`, `action`, `playerId` y `data`.

| Evento | Cuándo | `data` |
|---|---|---|
| `MATCH_STARTED` | Al empezar | `mode`, `turnSeconds` y `difficulty` (contra la computadora) |
| `PLAYER_JOINED` | Por cada jugador | `color`; la computadora además `bot: true` y `difficulty` |
| `PLAYER_ACTION DISC_DROPPED` | Cada ficha | `column`, `row`; las de la computadora llevan `ai` |
| `PLAYER_ACTION THREAT_CREATED` | Alguien queda a una ficha de ganar | `column`, `row` de la casilla que completaría el 4 |
| `PLAYER_ACTION THREAT_BLOCKED` | El rival ocupa esa casilla | `column`, `row`, `attackerId` |
| `PLAYER_ACTION UNDO` | Deshacer (uno por cada ficha que se quita) | `column`, `row` de la ficha deshecha |
| `PLAYER_ACTION HINT_USED` | Pedir una pista | `column` sugerida |
| `PLAYER_ACTION TURN_TIMEOUT` | Se acabó el tiempo del turno | `seconds` |
| `PLAYER_ACTION CONNECT_FOUR` | El 4 en línea ganador | `direction` |
| `MATCH_PAUSED` / `MATCH_RESUMED` | Pausa y reanudación | `reason` |
| `PLAYER_LEFT` | Al cerrar la partida a la mitad, por cada persona | — |
| `MATCH_FINISHED` | Al terminar (una sola vez) | `reason`: `normal` o `stopped` |

**La decisión de la IA** (`data.ai`), por ejemplo:

```json
{ "type": "PLAYER_ACTION", "action": "DISC_DROPPED", "playerId": "cpu",
  "data": { "column": 4, "row": 2,
            "ai": { "engine": "prolog-minimax", "depth": 3, "score": 12, "nodes": 81, "ms": 35 } } }
```

**Validación:** GameStats descarta los eventos que rompen sus reglas de contexto (turnos, gravedad, nada durante la pausa…). Este juego se prueba contra una copia de esas reglas (`test/support/scalaRules.ts`) con **3000 partidas al azar**, sin ningún descarte, y contra GameStats real en el CD.

## 9. Manifiesto (`game.json`)

`public/game.json` es la ficha del juego que lee la consola (protocolo, sección 2):

| Campo | Valor |
|---|---|
| `id` | `connect4` (nombre del contenedor `game-connect4` y prefijo del `matchId`) |
| `gameStatsId` | `connect4` (el `gameId` de cada evento) |
| `modes` | `vs-cpu`, `local-2p` |
| `options` | `difficulty` (solo `vs-cpu`) y `turnSeconds` |
| `howToPlay` | Texto corto con el objetivo y los controles |
| `instructions` | "Cómo se juega" por partes: objetivo, paso a paso, controles y consejos. La consola lo muestra antes de jugar y durante la partida |

## 10. Modo de prueba (sin la consola)

Abriendo `/games/connect4/` directamente (fuera de la consola) aparece un formulario propio para probar el juego solo:

- elegir modo, nombres, dificultad y tiempo por turno;
- botones Pausar, Reanudar, Reiniciar, Terminar y Nueva partida;
- la lista de eventos que se mandan a GameStats, con la respuesta de Go;
- un interruptor para no guardar la partida en las estadísticas.

## 11. Pruebas

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `Board.test.ts` | 6 | Soltar fichas, columnas llenas, 4 en línea en todas las direcciones, amenazas |
| `Connect4Match.test.ts` | 11 | Turnos, ganador, empate, amenazas creadas y tapadas, deshacer de a dos, tiempo agotado |
| `Connect4Game.test.ts` | 13 | Ciclo de vida, la IA (con una IA falsa), pausa con la IA pensando, pistas, reintentos |
| `Connect4App.test.ts` | 3 | El juego dentro de la consola por el SDK, con una consola de mentira |
| `MinThinkTime.test.ts` | 3 | La espera mínima y su cancelación |
| `events.test.ts` | 8 | El adapter y 3000 partidas al azar contra las reglas de GameStats |
| `gamestats.integration.test.ts` | 2 | Partidas reales contra GameStats y una entera contra Prolog (solo con el compose corriendo) |

**Total: 44 pruebas** (más las 2 de integración, que se saltan si no hay GameStats).

## 12. Cómo correrlo

```bash
npm ci
npm test                 # 44 pruebas
npm run build
npm run dev              # modo de prueba en http://localhost:5173/games/connect4/
                         # (/api va al gateway: antes, "docker compose up -d --build --wait" en la raíz)

# Con el compose corriendo: partidas reales a GameStats, incluida una entera contra Prolog
GAMESTATS_URL=http://localhost:8000 npm run test:gamestats
```

**Con Docker**, desde la **raíz** del repo, porque usa el SDK:

```bash
docker build -f games/connect4/Dockerfile -t gameconsole-game-connect4 .
```

El contenedor corre `sdk/server`: sirve el juego bajo `/games/connect4/`, publica `game.json` y se registra solo en el registry con su latido (`REGISTRY_URL`).
