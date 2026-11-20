# Pelea (fighting)

El juego para **2 personas en el mismo teclado** de DnD Games: una pelea 1 contra 1, al mejor de 1, 3 o 5 rounds. Gana quien deja al rival sin vida o tiene más vida cuando se acaba el tiempo. Se dibuja en un `<canvas>`.

Es una app independiente: tiene su propio contenedor (`game-fighting`), se registra sola en la consola y manda sus eventos a GameStats con el contrato del Proyecto 1.

---

## Contenido

1. [Cómo se juega](#1-cómo-se-juega)
2. [Reglas del combate](#2-reglas-del-combate)
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

**Objetivo:** ganar más rounds que tu rival. Un round se gana dejando al otro sin vida (KO) o teniendo más vida cuando se acaba el tiempo.

1. El Jugador 1 (**Brasa**, rojo) está a la izquierda y el Jugador 2 (**Marea**, celeste) a la derecha, en el mismo teclado.
2. Golpea y patea para bajarle la vida al rival; bloquea para no recibir daño.
3. Cada round dura 60 segundos. Gana la pelea quien gane la mayoría de los rounds.

**Controles**

| Acción | Jugador 1 (izquierda) | Jugador 2 (derecha) |
|---|---|---|
| Caminar | **A** / **D** | **←** / **→** |
| Saltar | **W** | **↑** |
| Golpe (puño) | **F** | **K** |
| Patada | **S** + **F** | **↓** + **K** |
| Bloquear | **G** | **L** |

Golpear en el aire también es patada. El bloqueo solo sirve de frente.

**Opción:** cantidad de rounds: 1, mejor de 3 o mejor de 5 (por defecto, mejor de 3).

## 2. Reglas del combate

Todos los valores están en `src/domain/CombatRules.ts` (`DEFAULT_RULES`):

| Regla | Valor |
|---|---|
| Vida de cada luchador | 100 |
| Duración de un round | 60 s |
| Daño del puño / de la patada | 7 / 11 |
| Alcance del puño / de la patada | 62 / 86 px |
| Aturdimiento al recibir un golpe | 0,28 s (menos que un puño completo: el rival alcanza a bloquear, no hay combos infinitos) |
| Frenado al bloquear | 0,18 s |
| Ventana del combo | 0,75 s entre dos golpes que conectan |

**Cómo termina:**

- **Round:** por KO (vida en 0) o por tiempo. Por tiempo gana quien tiene más vida; con la misma vida es empate.
- **Pelea:** gana quien llega primero a la mayoría de los rounds. Si se juegan todos sin llegar, gana quien ganó más; si empatan, no hay ganador (igual que calcula GameStats).

## 3. Arquitectura

```
src/
  domain/
    HitBox.ts             rectángulos de choque
    Arena.ts              el escenario (dojo): ancho, piso, posiciones iniciales
    CombatRules.ts        daño, bloqueo, alcance y tiempos de cada golpe
    Round.ts              reloj y resultado de un round
    FightingMatch.ts      la pelea: rounds al mejor de N, combos y hechos
    fighter/
      Fighter.ts          un luchador: posición, vida, movimiento
      states.ts           sus estados: quieto, caminando, saltando, atacando, bloqueando, golpeado, KO
      Intent.ts           lo que quiere hacer en este cuadro (según las teclas)
      FighterFactory.ts   crea a Brasa y Marea
  input/
    ControlScheme.ts      qué tecla hace qué, por jugador
    KeyboardInput.ts      el teclado del navegador
  adapter/
    GameStatsAdapter.ts   hechos de la pelea -> eventos del contrato de GameStats
  game/
    FightingGame.ts       ciclo con requestAnimationFrame y tiempo delta, pausa y cierre
    FightingApp.ts        el juego dentro de la consola (hereda de GameApp del SDK)
    ports.ts              interfaces que usa el juego
  ui/
    CanvasView.ts         arena, luchadores, barras de vida, reloj y marcador
  standalone/
    setup.ts              modo de prueba con un formulario
public/
  game.json               manifiesto del juego
```

## 4. Programación orientada a objetos

| Concepto | Dónde se ve |
|---|---|
| **Responsabilidades separadas** | `CombatRules` decide el daño, `Round` lleva el tiempo, `FightingMatch` cuenta rounds y combos, `Fighter` se mueve, `CanvasView` dibuja |
| **Encapsulación** | La vida y el estado de cada luchador solo cambian por las reglas del combate, no desde afuera |
| **Abstracción** | El juego depende de interfaces (`ports.ts`) y de un esquema de controles; se prueba sin teclado ni pantalla |
| **Herencia** | `FightingApp extends GameApp`; los estados del luchador comparten una base común |
| **Polimorfismo** | Cada estado del luchador (quieto, atacando, bloqueando…) responde distinto a la misma intención |

## 5. Patrones de diseño

| Patrón | Dónde | Para qué |
|---|---|---|
| **State** | `fighter/states.ts` | Cada estado del luchador decide qué puede hacer (no se ataca mientras te golpean) |
| **Factory** | `FighterFactory` | Crea cada luchador con su personaje, color y lado |
| **Strategy** | `CombatRules`, `ControlScheme` | Las reglas del combate y los controles se cambian sin tocar el resto |
| **Observer** | `FightingMatch.facts` (`Emitter`) | La pelea publica sus hechos; el adapter se suscribe |
| **Adapter** | `GameStatsAdapter` | Convierte los hechos en eventos del contrato de GameStats |
| **Template Method** | `FightingApp extends GameApp` | El SDK define el ciclo; el juego llena sus pasos |

## 6. Ciclo de una partida

```
loading ──INIT──► ready ──START──► playing ⇄ paused ──► finished
```

| Mensaje de la consola | Qué hace el juego |
|---|---|
| `INIT` | Arma la pelea con la cantidad de rounds elegida |
| `START` | Emite `MATCH_STARTED {stage, rounds}` y un `PLAYER_JOINED {character}` por luchador; empieza el round 1 |
| `PAUSE` / `RESUME` | Detiene y reanuda el reloj y el movimiento |
| `STOP` | Si la pelea empezó, emite `PLAYER_LEFT` de cada uno y `MATCH_FINISHED` |

## 7. Eventos para GameStats

Uno por hecho del juego, **nunca por cuadro**: las posiciones mientras se mueven no se mandan.

| Evento | Cuándo | `data` |
|---|---|---|
| `MATCH_STARTED` | Al empezar | `stage` (`dojo`), `rounds` (1, 3 o 5) |
| `PLAYER_JOINED` | Por cada luchador | `character` (`brasa` o `marea`) |
| `PLAYER_ACTION ATTACK` | Un golpe suelto (puño o patada) | `targetId`, `move`, `hit`, `damage` (0 si falló o lo bloquearon), `round` |
| `PLAYER_ACTION BLOCK` | Bloquea un golpe | `attackerId`, `round` |
| `PLAYER_ACTION COMBO` | 2 o más golpes que conectan seguidos (cada uno a menos de 0,75 s del anterior). **Reemplaza** a los `ATTACK` de esos golpes, así el daño del round suma exactamente la vida que se quitó | `targetId`, `hits`, `damage`, `round` |
| `PLAYER_ACTION KNOCKDOWN` | El golpe que deja al rival en 0 | `targetId`, `round` |
| `PLAYER_ACTION ROUND_WON` | Alguien gana un round | `round`, `remainingHealth`, `method` (KO o tiempo) |
| `PLAYER_ACTION ROUND_DRAW` | Un round termina empatado | `round`, `method`, `otherId` |
| `MATCH_PAUSED` / `MATCH_RESUMED` | Pausa y reanudación | `reason` |
| `PLAYER_LEFT` | Al cerrar la pelea a la mitad | — |
| `MATCH_FINISHED` | Al terminar (una sola vez) | `reason`: `normal` o `stopped` |

**Validación:** `test/support/scalaRules.ts` es una copia de las reglas de GameStats para fighting (schema y `FightingCheck`); `test/events.test.ts` simula cientos de peleas al azar (al mejor de 1, 3 y 5) y revisa que ningún evento se descarte.

## 8. Manifiesto (`game.json`)

| Campo | Valor |
|---|---|
| `id` / `gameStatsId` | `fighting` |
| `modes` | `local-2p` (2 personas en el mismo teclado) |
| `options` | `rounds` (1, 3 o 5) |
| `howToPlay` | Texto corto con los controles de cada jugador |
| `instructions` | "Cómo se juega" por partes: objetivo, paso a paso, controles por jugador y consejos. La consola lo muestra antes de jugar y durante la partida |

## 9. Pruebas

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `CombatRules.test.ts` | 8 | Daño, bloqueo, alcance y tiempos de cada golpe |
| `Fighter.test.ts` | 15 | Movimiento, salto, estados del luchador |
| `FightingMatch.test.ts` | 23 | Rounds, KO, tiempo, empates, combos y ganador |
| `FightingApp.test.ts` | 9 | El juego dentro de la consola por el SDK |
| `events.test.ts` | 8 | Eventos y peleas al azar contra las reglas de GameStats |

**Total: 63 pruebas.**

## 10. Cómo correrlo

```bash
npm ci
npm test         # 63 pruebas
npm run build
npm run dev      # abierto directamente: modo de prueba con un formulario
```

**Con Docker**, desde la **raíz** del repo, porque usa el SDK:

```bash
docker build -f games/fighting/Dockerfile -t gameconsole-game-fighting .
```

En `docker-compose.yml` el servicio se llama `game-fighting` (el gateway lo busca por ese nombre) y necesita `REGISTRY_URL: "http://registry:8080"`.
