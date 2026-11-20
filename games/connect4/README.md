# 4 en línea

Tablero de 7 columnas por 6 filas: gana quien conecta 4 fichas en línea (horizontal, vertical o diagonal). Es el juego de **usuario contra computadora**: la computadora decide con la IA en Prolog.

## Contenido

- [Cómo se juega](#cómo-se-juega)
- [Cómo está armado](#cómo-está-armado)
- [Programación orientada a objetos](#programación-orientada-a-objetos)
- [Patrones](#patrones)
- [Eventos para GameStats](#eventos-para-gamestats)
- [Dentro de la consola](#dentro-de-la-consola)
- [Cómo correrlo](#cómo-correrlo)

## Cómo se juega

| | |
|---|---|
| **Modos** | Contra la computadora (IA en [Prolog](../../prolog/)) · 2 personas en la misma pantalla |
| **Opciones** | Dificultad: fácil, media o difícil (solo contra la computadora) · Tiempo por turno: sin límite, 15, 30 o 60 s |
| **Controles** | Clic en una columna o teclas **1–7** · **P** = pista · **U** = deshacer |
| **Pista** | La IA sugiere la mejor columna (con dificultad difícil). Hasta 3 por partida |
| **Deshacer** | Contra la computadora: quita tu última ficha y la de la computadora |
| **Tiempo por turno** | Si se acaba, pierdes el turno |

## Cómo está armado

```
src/
  domain/Board.ts            tablero inmutable: soltar ficha, 4 en línea, amenazas
  domain/Connect4Match.ts    reglas de la partida: turnos, amenazas, ganador, empate, deshacer
  adapter/GameStatsAdapter   hechos del juego -> eventos del contrato de GameStats
  ai/MoveStrategy.ts         cómo elige columna la computadora (PrologStrategy, MinThinkTime)
  game/Connect4App.ts        el juego dentro de la consola (hereda de GameApp del SDK)
  game/Connect4Game.ts       controlador: une reglas, IA, vista y consola
  game/ports.ts              interfaces: GameHost, MatchContext, Connect4View
  ui/DomBoardView.ts         dibujo con HTML/CSS y teclado
  standalone/                modo de prueba sin consola
public/game.json             manifiesto (protocolo, sección 2)
```

## Programación orientada a objetos

| Concepto | Dónde se ve |
|---|---|
| **Responsabilidades separadas** | El tablero (`Board`) no sabe de turnos; la partida (`Connect4Match`) no sabe de pantallas ni de red; la vista (`DomBoardView`) no toca las reglas |
| **Encapsulación** | `Board` es inmutable: soltar una ficha devuelve un tablero nuevo. El estado de la partida solo cambia por sus métodos (`drop`, `undo`, `timeout`) |
| **Abstracción** | `Connect4Game` depende de interfaces (`GameHost`, `Connect4View`, `MoveStrategy`), no de clases concretas: se prueba con versiones falsas |
| **Herencia y polimorfismo** | `Connect4App` hereda de `GameApp` (SDK). `PrologStrategy` y `MinThinkTime` implementan la misma interfaz `MoveStrategy` |

## Patrones

| Patrón | Dónde | Para qué |
|---|---|---|
| **Adapter** | `GameStatsAdapter` | Traduce "cayó una ficha en (4, 2)" a `PLAYER_ACTION DISC_DROPPED {column: 4, row: 2}` |
| **Observer** | `Connect4Match.facts` | La partida publica sus hechos; el adapter se suscribe sin que la partida lo conozca |
| **Command** | `DropCommand` en `Connect4Match` | Cada ficha guarda cómo estaba la partida antes: deshacer es volver a ese estado |
| **Strategy** | `MoveStrategy` / `PrologStrategy` | La computadora elige columna con Prolog; en las pruebas, con una IA falsa |
| **Decorator** | `MinThinkTime` | La computadora tarda al menos 0,7 s, así la ficha no aparece de golpe |
| **Proxy** | `PrologStrategy` | El juego pide una jugada como si fuera local; la clase se encarga de la red, el tiempo límite y los reintentos |
| **State** | `Connect4Game` (`loading → ready → playing ⇄ paused → finished`) | Cada mensaje de la consola solo vale en ciertos estados |
| **Template Method** | `Connect4App extends GameApp` | El SDK maneja el protocolo; el juego llena sus pasos |

## Eventos para GameStats

Usa las acciones del 4 en línea que GameStats ya conocía desde el Proyecto 1:

| Evento | Cuándo |
|---|---|
| `MATCH_STARTED` | Al empezar, con el modo, la dificultad y el tiempo por turno |
| `PLAYER_JOINED` | Por cada jugador, con su color (y `bot`, `difficulty` si es la computadora) |
| `PLAYER_ACTION DISC_DROPPED` | Cada ficha, con columna y fila. Las de la computadora llevan en `data.ai` su decisión (motor, profundidad, puntaje, posiciones revisadas, tiempo) |
| `THREAT_CREATED` / `THREAT_BLOCKED` | Alguien tiene 3 en línea con la cuarta casilla libre / el rival la tapa |
| `UNDO`, `HINT_USED`, `TURN_TIMEOUT` | Deshacer, pista, turno perdido por tiempo |
| `CONNECT_FOUR` | El 4 en línea ganador, con su dirección |
| `MATCH_PAUSED` / `MATCH_RESUMED` / `PLAYER_LEFT` / `MATCH_FINISHED` | Ciclo de la partida |

Todos pasan las reglas de contexto de GameStats (turnos, gravedad, nada durante una pausa…). Se comprueba con 3000 partidas al azar contra una copia de esas reglas (`test/support/scalaRules.ts`) y contra GameStats real.

## Dentro de la consola

`Connect4App extends GameApp` (SDK) recibe los mensajes de la consola (`onInit`, `onStart`, `onPause`, `onResume`, `onStop`) y se los pasa a `Connect4Game`, que solo conoce la interfaz `GameHost`. El SDK sella los eventos y el contenedor corre `sdk/server`, que sirve el juego bajo `/games/connect4/` y lo registra solo en el registry.

**Modo de prueba:** abriendo `/games/connect4/` directamente (fuera de la consola) aparece un formulario propio, con botones para pausar, reiniciar, terminar o empezar una partida nueva, y la lista de eventos enviados a GameStats.

## Cómo correrlo

```bash
npm ci
npm test                 # 44 pruebas: reglas, IA, protocolo con la consola y 3000 partidas al azar
npm run dev              # modo de prueba en http://localhost:5173/games/connect4/
                         # (/api va al gateway: antes, "docker compose up -d --build --wait" en la raíz)

# Con el compose corriendo: partidas reales a GameStats, incluida una entera contra Prolog
GAMESTATS_URL=http://localhost:8000 npm run test:gamestats
```

Con Docker se construye desde la **raíz** del repo: `docker build -f games/connect4/Dockerfile .`
