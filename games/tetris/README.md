# Tetris

El juego de **un jugador** de DnD Games: acomoda las piezas que caen para completar líneas horizontales. Cada línea completa se borra y suma puntos; con más líneas subes de nivel y las piezas caen más rápido.

Es una app independiente: tiene su propio contenedor (`game-tetris`), se registra sola en la consola y manda sus eventos a GameStats con el contrato del Proyecto 1.

---

## Contenido

1. [Cómo se juega](#1-cómo-se-juega)
2. [Reglas y puntaje](#2-reglas-y-puntaje)
3. [Arquitectura](#3-arquitectura)
4. [Programación orientada a objetos](#4-programación-orientada-a-objetos)
5. [Patrones de diseño](#5-patrones-de-diseño)
6. [Ciclo de una partida](#6-ciclo-de-una-partida)
7. [Eventos para GameStats](#7-eventos-para-gamestats)
8. [Manifiesto (`game.json`)](#8-manifiesto-gamejson)
9. [Pruebas](#9-pruebas)
10. [Cómo correrlo](#10-cómo-correrlo)

---

## 1. Cómo se juega

**Objetivo:** completar líneas horizontales sin que las piezas se amontonen hasta arriba.

1. Las piezas caen solas desde arriba, una a la vez.
2. Muévelas y gíralas antes de que toquen el fondo o otra pieza.
3. Cuando una fila queda llena, se borra y suma puntos.
4. Pierdes si una pieza nueva ya no cabe arriba.

**Controles**

| Tecla | Qué hace |
|---|---|
| **←** / **→** | Mover la pieza a los lados |
| **↑** o **X** | Girar la pieza |
| **Z** | Girar la pieza al revés |
| **↓** | Bajar más rápido |
| **Espacio** | Dejarla caer de golpe |
| **C** | Guardar la pieza para después (una vez por pieza) |

**Opción:** nivel inicial, del 1 al 15 (por defecto, 1).

## 2. Reglas y puntaje

| Regla | Valor |
|---|---|
| Tablero | 10 columnas × 20 filas |
| Piezas | Las 7 clásicas, en "bolsa de 7" (`PieceBag`): las 7 salen una vez cada una antes de repetirse |
| Siguientes | Se ven las próximas 3 piezas, y una sombra muestra dónde va a caer la actual |
| Al girar | Si no cabe, prueba moverla un poco a los lados o arriba (wall kicks simples) |
| Antes de fijarse | 0,5 s para acomodarla al tocar el fondo (hasta 15 veces) |
| Nivel | Sube cada 10 líneas, hasta el 30. La caída es más rápida en cada nivel |

**Puntaje** (lo mismo que suma GameStats con los eventos `LINES_CLEARED`):

| Jugada | Puntos (× el nivel) |
|---|---|
| 1 línea | 100 |
| 2 líneas | 300 |
| 3 líneas | 500 |
| 4 líneas (un "Tetris") | 800 |
| Giro en T (T-spin) sin líneas, o con 1, 2 o 3 | 400, 800, 1200, 1600 |

- **Back-to-back:** dos jugadas difíciles seguidas (Tetris o T-spin con líneas) valen 1,5 veces.
- **Combo:** cada limpieza seguida suma 50 × combo × nivel.
- Soltar piezas no da puntos.

## 3. Arquitectura

```
src/
  domain/
    Tetromino.ts        las 7 piezas y sus giros
    Board.ts            tablero de 10 × 20: choques, fijar piezas, borrar filas
    PieceBag.ts         la bolsa de 7
    Scoring.ts          puntaje y nivel
    facts.ts            los hechos del juego (pieza colocada, líneas, nivel…)
  game/
    TetrisGame.ts       reglas y ciclo con tiempo delta: caída, giro, guardar, fijar
    TetrisApp.ts        el juego dentro de la consola (hereda de GameApp del SDK)
  adapter/
    GameStatsAdapter.ts hechos del juego -> eventos del contrato de GameStats
  ui/
    CanvasView.ts       dibujo en <canvas>: tablero, sombra, siguientes, guardada, puntaje
    KeyboardInput.ts    teclado
    GameLoop.ts         requestAnimationFrame con tiempo delta
  standalone/
    setup.ts            modo de prueba sin consola (no manda eventos)
public/
  game.json             manifiesto del juego
```

## 4. Programación orientada a objetos

| Concepto | Dónde se ve |
|---|---|
| **Responsabilidades separadas** | `Board` solo sabe de celdas; `Scoring` solo de puntos y nivel; `TetrisGame` aplica las reglas; `CanvasView` solo dibuja |
| **Encapsulación** | El puntaje, el nivel y la pieza actual solo cambian por los métodos de `TetrisGame` (`move`, `rotate`, `softDrop`, `hardDrop`, `hold`) |
| **Abstracción** | `TetrisGame` publica hechos (`facts`) sin saber quién los escucha ni cómo se dibujan |
| **Herencia** | `TetrisApp extends GameApp`: el SDK maneja el protocolo y el juego llena sus pasos |

## 5. Patrones de diseño

| Patrón | Dónde | Para qué |
|---|---|---|
| **Template Method** | `TetrisApp extends GameApp` | El SDK define el ciclo; el juego llena `onInit`, `onStart`, `onPause`, `onResume`, `onStop` |
| **Adapter** | `GameStatsAdapter` | Convierte los hechos del juego en eventos del contrato de GameStats |
| **Observer** | `TetrisGame.facts` (`Emitter`) | El juego publica sus hechos; el adapter se suscribe |
| **State** | `Status` de `TetrisGame` y los estados del SDK | Qué se puede hacer en cada momento (jugando, en pausa, terminado) |
| **Mediator** | `TetrisApp` | Conecta la partida, la vista, el teclado y el ciclo de dibujo sin que se conozcan entre sí |

## 6. Ciclo de una partida

```
loading ──INIT──► ready ──START──► playing ⇄ paused ──► finished
```

| Mensaje de la consola | Qué hace el juego |
|---|---|
| `INIT` | Arma la partida con el nivel inicial elegido |
| `START` | Emite `MATCH_STARTED {startLevel}` y `PLAYER_JOINED`; empieza a caer la primera pieza |
| `PAUSE` / `RESUME` | Detiene y reanuda la caída; emite `MATCH_PAUSED` / `MATCH_RESUMED` |
| `STOP` | Si la partida empezó, emite `PLAYER_LEFT` y `MATCH_FINISHED` |

Al perder emite `TOP_OUT` y `MATCH_FINISHED` (sin `PLAYER_LEFT`, porque GameStats descarta cualquier evento del jugador después de `TOP_OUT`).

## 7. Eventos para GameStats

Uno por hecho del juego, **nunca por cuadro**: la caída automática no genera eventos.

| Acción (`PLAYER_ACTION`) | Cuándo | `data` |
|---|---|---|
| `PIECE_SPAWNED` | Aparece una pieza | `piece` |
| `PIECE_MOVED` / `PIECE_ROTATED` | La persona mueve o gira | `direction` |
| `SOFT_DROP` | Baja más rápido con ↓ | `cells` bajadas |
| `HARD_DROP` | Cae de golpe con Espacio | `cells` bajadas |
| `HOLD` | Guarda la pieza | `piece` |
| `PIECE_PLACED` | La pieza se fija | `piece`, `hardDrop` |
| `T_SPIN` | Se fija una T con un giro final (con o sin líneas) | `lines` (0 a 3) |
| `LINES_CLEARED` | Se borran filas | `lines`, `points`, `combo` |
| `ALL_CLEAR` | El tablero queda vacío | `lines` |
| `LEVEL_UP` | Sube de nivel | `level` |
| `STACK_HEIGHT` | Cambia la altura de la pila | `rows` |
| `TOP_OUT` | Pierde | — |

Además, `MATCH_STARTED {startLevel}`, `PLAYER_JOINED`, `MATCH_PAUSED`, `MATCH_RESUMED`, `PLAYER_LEFT` y `MATCH_FINISHED` (una sola vez).

**Validación:** `test/support/scalaRules.ts` es una copia de las reglas de GameStats para tetris; `test/events.test.ts` simula 200 partidas al azar y revisa que ningún evento se descarte.

## 8. Manifiesto (`game.json`)

| Campo | Valor |
|---|---|
| `id` / `gameStatsId` | `tetris` |
| `modes` | `solo` (1 jugador) |
| `options` | `startLevel` (1 a 15) |
| `howToPlay` | Texto corto con los controles (también se muestra en la pantalla del juego) |
| `instructions` | "Cómo se juega" por partes: objetivo, paso a paso, controles y consejos. La consola lo muestra antes de jugar y durante la partida |

## 9. Pruebas

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `Domain.test.ts` | 22 | Piezas, giros, tablero, bolsa de 7, puntaje y nivel |
| `TetrisGame.test.ts` | 21 | Caída, giros con wall kicks, guardar, fijar, líneas, T-spin, perder |
| `TetrisApp.test.ts` | 10 | El juego dentro de la consola por el SDK |
| `events.test.ts` | 5 | Eventos y 200 partidas al azar contra las reglas de GameStats |

**Total: 58 pruebas.**

## 10. Cómo correrlo

```bash
npm ci
npm test         # 58 pruebas
npm run build
npm run dev      # abierto directamente: modo de prueba sin consola (no manda eventos)
```

**Con Docker**, desde la **raíz** del repo, porque usa el SDK:

```bash
docker build -f games/tetris/Dockerfile -t gameconsole-game-tetris .
```

El contenedor corre `sdk/server`: sirve el juego bajo `/games/tetris/`, publica `game.json` y se registra solo en el registry (`REGISTRY_URL`).
