# 4 en línea

Tablero de 7 × 6, dos jugadores por turnos. Modos:
- **contra la computadora**, que decide con la IA en Prolog ([`prolog/`](../../prolog/));
- **2 personas** en la misma pantalla.

Opciones: dificultad (fácil, media o difícil) y tiempo por turno. Durante la partida se puede pedir una **pista** (la IA sugiere una columna; hasta 3 por partida). Contra la computadora, también se puede **deshacer** la última jugada propia.

## Cómo está armado

```
src/
  domain/Board.ts            tablero inmutable: soltar, 4 en línea, amenazas
  domain/Connect4Match.ts    reglas de la partida: turnos, amenazas, ganador, empate, deshacer
  adapter/GameStatsAdapter   hechos del juego -> eventos del contrato de GameStats
  ai/MoveStrategy.ts         cómo elige columna la computadora (PrologStrategy: POST /api/ai/connect4/move)
  game/Connect4Game.ts       controlador: ciclo de vida del protocolo (INIT/START/PAUSE/RESUME/STOP)
  game/ports.ts              GameHost, MatchContext, Connect4View: lo que el juego necesita de afuera
  ui/DomBoardView.ts         dibujo con HTML/CSS y teclado (1–7, P = pista, U = deshacer)
  standalone/                modo de prueba sin consola (formulario + envío directo a /api/events)
public/game.json             manifiesto (protocolo, sección 2)
```

| Patrón | Dónde | Para qué |
|---|---|---|
| **Adapter** | `GameStatsAdapter` | Traduce "cayó una ficha en (4, 2)" a `PLAYER_ACTION DISC_DROPPED {column: 4, row: 2}` |
| **Observer** | `Connect4Match.facts` (`Emitter`) | La partida publica sus hechos; el adapter se suscribe sin que la partida lo conozca |
| **Command** | `DropCommand` en `Connect4Match` | Cada ficha guarda cómo estaba la partida antes: deshacer es volver a ese estado |
| **Strategy** | `MoveStrategy` / `PrologStrategy` | La computadora elige columna con Prolog; en las pruebas, con una IA falsa |
| **Proxy** | `PrologStrategy` | El juego pide una jugada como si fuera local; la clase se encarga de la red, el tiempo límite y los reintentos |
| **State** | `Connect4Game` (`loading → ready → playing ⇄ paused → finished`) | Cada mensaje de la consola solo vale en ciertos estados |

**Eventos que pasan las reglas de GameStats:** turnos, gravedad, `THREAT_CREATED` cuando alguien tiene 3 y una casilla vacía le completaría la cuarta, `THREAT_BLOCKED` cuando el rival cae ahí, `UNDO` de a dos (la ficha de la IA y la propia), `CONNECT_FOUR` al final y la decisión de la IA en `data.ai`.

## Cómo correrlo

```bash
npm install
npm test                 # 38 pruebas (incluye 3000 partidas al azar contra una copia de las reglas de Scala)
npm run dev              # modo de prueba en http://localhost:5173/games/connect4/
                         # (/api va al gateway: antes, "docker compose up -d --build --wait" en la raíz)

# Con el compose corriendo: partidas reales a GameStats, incluida una entera contra Prolog
GAMESTATS_URL=http://localhost:8000 npm run test:gamestats
```

**Falta (cuando esté el SDK):** la clase `Connect4App extends GameApp` que llama a `init/start/pause/resume/stop` de `Connect4Game` (ver `src/main.ts`), y el Dockerfile con `sdk/server`.
