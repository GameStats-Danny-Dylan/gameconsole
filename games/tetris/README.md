# Tetris

Tetris de un solo jugador (modo `solo`). Opción: nivel inicial (1 a 15). Controles: ← → mover, ↑ (o X) rotar, Z rotar al revés, ↓ bajar, Espacio caída instantánea, C guardar pieza.

```
src/
  domain/     Tetromino (Piece), Board 10×20, PieceBag (bolsa de 7), Scoring y Level, facts
  game/       TetrisGame (reglas y ciclo con tiempo delta) y TetrisApp (hereda de GameApp del SDK)
  adapter/    GameStatsAdapter: hechos del juego -> eventos del contrato de GameStats
  ui/         CanvasView, KeyboardInput, GameLoop
  standalone/ modo de prueba sin consola (no manda eventos)
public/game.json   manifiesto (protocolo, sección 2) con howToPlay
```

| Patrón | Dónde |
|---|---|
| Template Method | `TetrisApp` llena los pasos de `GameApp` |
| Adapter | `GameStatsAdapter` |
| Observer | `TetrisGame.facts` (`Emitter`) |
| State | `Status` de `TetrisGame` y los estados del SDK |
| Mediator | `TetrisApp` conecta partida, vista, teclado y ciclo |

Puntaje = suma de `LINES_CLEARED.points` (lo mismo que calcula GameStats). Al perder se emite `TOP_OUT` y `MATCH_FINISHED` (sin `PLAYER_LEFT`: Scala descarta todo evento del jugador después de `TOP_OUT`).

```bash
npm install && npm test && npm run build
docker build -f games/tetris/Dockerfile -t gameconsole-game-tetris .   # desde la raíz del repo
```
