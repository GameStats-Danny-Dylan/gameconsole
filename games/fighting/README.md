# Pelea (fighting)

El juego para **2 personas en el mismo teclado** de DnD Games (modo `local-2p`): una pelea 1 contra 1, al mejor de 1, 3 o 5 rounds. Gana quien deja al rival sin vida o tiene más vida cuando se acaba el tiempo. Todo se dibuja por código en un `<canvas>` (sin imágenes ni bibliotecas): luchadores articulados, escenario por capas y marcador clásico, con efectos y sonido.

Es una app independiente: tiene su propio contenedor (`game-fighting`), se registra sola en la consola y manda sus eventos a GameStats con el contrato del Proyecto 1.

---

## Contenido

1. [Cómo se juega](#1-cómo-se-juega)
2. [Reglas del combate](#2-reglas-del-combate)
3. [Arquitectura](#3-arquitectura)
4. [Programación orientada a objetos](#4-programación-orientada-a-objetos)
5. [Patrones de diseño](#5-patrones-de-diseño)
6. [Gráficos, sensación de juego y sonido](#6-gráficos-sensación-de-juego-y-sonido)
7. [Ciclo de una partida](#7-ciclo-de-una-partida)
8. [Eventos para GameStats](#8-eventos-para-gamestats)
9. [Manifiesto (`game.json`)](#9-manifiesto-gamejson)
10. [Pruebas](#10-pruebas)
11. [Cómo correrlo](#11-cómo-correrlo)

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
| Silenciar o activar el sonido | **M** (sirve para los dos) | **M** |

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

| Carpeta | Qué tiene | Patrones |
|---|---|---|
| `src/domain/` | `HitBox`, `Arena`, `CombatRules` (daño, bloqueo, alcance, tiempos), `Round`, `FightingMatch` (rounds al mejor de N, combos, hechos) | Strategy (`CombatRules`), Observer (`facts`) |
| `src/domain/fighter/` | `Fighter`, sus estados (`idle`, `walk`, `jump`, `attack`, `block`, `hit`, `ko`), `InputBuffer` y `FighterFactory` | State, Factory |
| `src/input/` | Mapeo de teclas por jugador y el teclado del navegador | Strategy |
| `src/adapter/` | `GameStatsAdapter`: hechos de la pelea → eventos del contrato | Adapter |
| `src/game/` | `FightingGame` (ciclo con `requestAnimationFrame` y tiempo delta, pausa, cierre) y `FightingApp extends GameApp` | Template Method |
| `src/ui/` | `CanvasView` coordina a `StageRenderer` (cielo, montañas, patio del dojo y piso, con parallax), `FighterRenderer` (luchadores articulados con ropa por personaje, sombra y destello) y `HudRenderer` (barras con estela de daño, retratos, medallones de rounds, reloj y carteles animados) | Facade (`CanvasView`) |
| `src/ui/pose/` | `Skeleton` (huesos y cinemática directa) y `PoseAnimator` (la pose de cada estado: respiración, ciclo de piernas, salto, puño, patada, bloqueo, golpeado, caída del KO) | State (lee el estado del luchador) |
| `src/fx/` | `GameFeel` une la pelea con `HitStop` (congelado de impacto), `SlowMotion` (cámara lenta del KO final) y `EffectsSystem` (estela de vida, `ParticleSystem`, `CameraRig`, contador de combo, aterrizaje, festejo). Todo es lógica pura que avanza con el ciclo: en la pausa queda quieto | Mediator (`GameFeel`), Facade (`EffectsSystem`), Observer (`impacts`) |
| `src/audio/` | `SoundPort` (lo que el juego necesita del sonido) y `SoundBank` (efectos sintetizados con WebAudio) | Adapter / inyección (`SoundPort`) |
| `src/standalone/` | Modo de prueba con un formulario (abriendo el juego directamente) | — |
| `public/game.json` | El manifiesto del juego | — |

## 4. Programación orientada a objetos

| Concepto | Dónde se ve |
|---|---|
| **Responsabilidades separadas** | `CombatRules` decide el daño, `Round` lleva el tiempo, `FightingMatch` cuenta rounds y combos, `Fighter` se mueve, los renderers dibujan, `GameFeel` maneja los efectos y `SoundBank` el sonido |
| **Encapsulación** | La vida y el estado de cada luchador solo cambian por las reglas del combate, no desde afuera; el dibujo y los efectos solo leen |
| **Abstracción** | El juego depende de interfaces (`ports.ts`, `SoundPort`) y de un esquema de controles; se prueba sin teclado, sin pantalla y sin audio |
| **Herencia** | `FightingApp extends GameApp`; los estados del luchador comparten una base común |
| **Polimorfismo** | Cada estado del luchador (quieto, atacando, bloqueando…) responde distinto a la misma intención y tiene su propia pose |

## 5. Patrones de diseño

| Patrón | Dónde | Para qué |
|---|---|---|
| **State** | `fighter/states.ts`, `PoseAnimator` | Cada estado del luchador decide qué puede hacer (no se ataca mientras te golpean) y cómo se dibuja |
| **Factory** | `FighterFactory` | Crea cada luchador con su personaje, color y lado |
| **Strategy** | `CombatRules`, controles | Las reglas del combate y los controles se cambian sin tocar el resto |
| **Observer** | `FightingMatch.facts` y `impacts` (`Emitter`) | La pelea publica sus hechos (el adapter se suscribe) y sus golpes (los efectos y el sonido se suscriben) |
| **Adapter** | `GameStatsAdapter`, `SoundPort` | Convierte los hechos en eventos de GameStats; separa el juego de WebAudio |
| **Template Method** | `FightingApp extends GameApp` | El SDK define el ciclo; el juego llena sus pasos |
| **Mediator** | `GameFeel` | Une la pelea con el congelado de impacto, la cámara lenta, los efectos y el sonido |
| **Facade** | `CanvasView`, `EffectsSystem` | Una sola entrada para dibujar todo y para todos los efectos |

## 6. Gráficos, sensación de juego y sonido

### Personajes

Diseños propios del juego (`src/ui/looks.ts`): **Brasa** (camiseta sin mangas carmesí con ribete naranja, faja ámbar con puntas al viento, pelo en cresta) y **Marea** (chaqueta corta turquesa cruzada, vendas blancas, canilleras y coleta larga). Las animaciones solo leen al luchador: nunca mueven una HitBox (`test/render.test.ts` lo revisa cuadro por cuadro, y que el puño o el pie dibujados lleguen a la zona del golpe).

### Sensación de juego

- **Congelado de impacto** (`HitStop`): al tocar, la pelea (y el reloj del round) se detiene 3 cuadros con un puño, 4 con una patada o en el KO y 2 si lo bloquean. Las teclas apretadas en ese momento se guardan para el cuadro siguiente.
- **Retroceso con fricción**: el golpeado sale empujado y frena solo (fricción que no depende de los cuadros por segundo). Contra la pared el empuje lo absorbe el que pega, así una cadena de golpes no pasa de 3 (`test/movement.test.ts`).
- **Movimiento**: caminar acelera en unos cuadros y frena en seco al soltar (para medir bien las distancias); el salto sube rápido, cuelga en la cima y cae un poco más rápido.
- **Buffer de entrada** (`InputBuffer`, 0,1 s): un golpe o salto pulsado un poco antes de poder hacerlo sale apenas se puede. No inventa acciones: sale igual que si se pulsara en ese cuadro.
- **Efectos**: chispas y estrella de impacto, esquirlas y arco de guardia al bloquear, polvo al caminar, aterrizar y caer; sacudida de pantalla en patadas y KO; contador de combo ("3 GOLPES") del lado de quien lo hace; destello, zoom leve y cámara lenta en el KO que decide la pelea.

Nada de esto cambia los hechos ni los eventos: `FightingMatch.impacts` avisa los golpes solo para la presentación.

### Sonido

Efectos sintetizados en el momento con WebAudio, sin archivos (`src/audio/SoundBank.ts`): puño, patada, bloqueo, KO, campana de round y el silbido de un golpe que sale.

- El audio se crea recién con la primera tecla o clic dentro del juego (política de reproducción automática de los navegadores).
- **M** silencia y vuelve a activar; se recuerda en el navegador y el marcador muestra un aviso mientras está silenciado.
- En la pausa (o al cerrar la partida) el audio se suspende: lo que sonaba se corta y no suena nada nuevo hasta seguir.
- Los sonidos salen de `GameFeel`, igual que los efectos: no cambian hechos ni eventos (`test/sound.test.ts`).

## 7. Ciclo de una partida

```
loading ──INIT──► ready ──START──► playing ⇄ paused ──► finished
```

| Mensaje de la consola | Qué hace el juego |
|---|---|
| `INIT` | Arma la pelea con la cantidad de rounds elegida |
| `START` | Emite `MATCH_STARTED {stage, rounds}` y un `PLAYER_JOINED {character}` por luchador; empieza el round 1 |
| `PAUSE` / `RESUME` | Detiene y reanuda el reloj, el movimiento, los efectos y el sonido |
| `STOP` | Si la pelea empezó, emite `PLAYER_LEFT` de cada uno y `MATCH_FINISHED` |

## 8. Eventos para GameStats

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

## 9. Manifiesto (`game.json`)

| Campo | Valor |
|---|---|
| `id` / `gameStatsId` | `fighting` |
| `modes` | `local-2p` (2 personas en el mismo teclado) |
| `options` | `rounds` (1, 3 o 5) |
| `howToPlay` | Texto corto con los controles de cada jugador |
| `instructions` | "Cómo se juega" por partes: objetivo, paso a paso, controles por jugador y consejos (entre ellos, la tecla **M** del sonido). La consola lo muestra antes de jugar y durante la partida |

## 10. Pruebas

| Archivo | Pruebas | Qué revisa |
|---|---|---|
| `CombatRules.test.ts` | 8 | Daño, bloqueo, alcance y tiempos de cada golpe |
| `Fighter.test.ts` | 15 | Movimiento, salto, estados del luchador |
| `FightingMatch.test.ts` | 23 | Rounds, KO, tiempo, empates, combos y ganador |
| `FightingApp.test.ts` | 9 | El juego dentro de la consola por el SDK |
| `events.test.ts` | 8 | Eventos y peleas al azar contra las reglas de GameStats |
| `movement.test.ts` | 11 | Buffer de entrada, aceleración, fricción y salto, que no haya combos infinitos (también contra la pared) y los avisos de impacto |
| `feel.test.ts` | 11 | Congelado de impacto, cámara lenta, partículas y cámara, y el congelado dentro del ciclo (pausa, teclas, KO final) |
| `effects.test.ts` | 3 | Estela de vida, que nada avance en la pausa y el aterrizaje |
| `render.test.ts` | 10 | Dibujar no cambia la pelea; el golpe dibujado llega a donde conecta |
| `sound.test.ts` | 8 | Qué suena en cada golpe, silencio con M y pausa |

**Total: 106 pruebas.**

## 11. Cómo correrlo

```bash
npm ci
npm test         # 106 pruebas
npm run build
npm run dev      # abierto directamente: modo de prueba con un formulario
```

**Con Docker**, desde la **raíz** del repo, porque usa el SDK:

```bash
docker build -f games/fighting/Dockerfile -t gameconsole-game-fighting .
```

En `docker-compose.yml` el servicio se llama `game-fighting` (el gateway lo busca por ese nombre) y necesita `REGISTRY_URL: "http://registry:8080"`.
