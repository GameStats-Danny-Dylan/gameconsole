# Pelea (fighting)

Pelea 1 contra 1 para 2 personas en el mismo teclado (modo `local-2p`), al mejor de 1, 3 o 5 rounds. Todo se dibuja por código en un `<canvas>` (sin imágenes ni bibliotecas): luchadores articulados, escenario por capas y marcador clásico.

| Jugador | Caminar | Saltar | Golpe | Patada | Bloqueo |
|---|---|---|---|---|---|
| Slot 1 (izquierda) | A / D | W | F | S + F | G |
| Slot 2 (derecha) | ← / → | ↑ | K | ↓ + K | L |

Golpear en el aire también es patada. El bloqueo solo sirve de frente. Un round termina por KO o por tiempo (60 s; gana el que tiene más vida, con la misma vida es empate). Gana la pelea quien llega a la mayoría de los rounds; si se juegan todos sin llegar, gana el que ganó más y, si empatan, no hay ganador (igual que calcula GameStats).

```bash
npm install
npm run dev     # abierto directamente: modo de prueba con un formulario
npm test        # Vitest
npm run build
```

## Estructura

| Carpeta | Qué hay | Patrón |
|---|---|---|
| `src/domain/` | `HitBox`, `Arena`, `CombatRules` (daño, bloqueo, alcance, tiempos), `Round`, `FightingMatch` (rounds al mejor de N, combos, hechos) | Strategy (`CombatRules`), Observer (`facts`) |
| `src/domain/fighter/` | `Fighter`, sus estados (`idle`, `walk`, `jump`, `attack`, `block`, `hit`, `ko`) y `FighterFactory` | State, Factory |
| `src/input/` | Mapeo de teclas por jugador (`KeyboardControls`) y el teclado del navegador | Strategy |
| `src/adapter/` | `GameStatsAdapter`: hechos de la pelea → eventos del contrato | Adapter |
| `src/game/` | `FightingGame` (ciclo con `requestAnimationFrame` y tiempo delta, pausa, cierre) y `FightingApp extends GameApp` | Template Method |
| `src/ui/` | `CanvasView` coordina a `StageRenderer` (cielo, montañas, patio del dojo y piso, con parallax), `FighterRenderer` (luchadores articulados con ropa por personaje, sombra y destello) y `HudRenderer` (barras con estela de daño, retratos, medallones de rounds, reloj y carteles animados) | Facade (`CanvasView`) |
| `src/ui/pose/` | `Skeleton` (huesos y cinemática directa) y `PoseAnimator` (la pose de cada estado: respiración, ciclo de piernas, salto, puño, patada, bloqueo, golpeado, caída del KO) | State (lee el estado del luchador) |
| `src/fx/` | `EffectsSystem`: lo que se anima con el tiempo de la pelea (reloj de animaciones, estela de vida, aterrizaje, festejo) | — |

## Personajes

Diseños propios del juego (`src/ui/looks.ts`): **Brasa** (camiseta sin mangas carmesí con ribete naranja, faja ámbar con puntas al viento, pelo en cresta) y **Marea** (chaqueta corta turquesa cruzada, vendas blancas, canilleras y coleta larga). Las animaciones solo leen al luchador: nunca mueven una HitBox (`test/render.test.ts` lo revisa cuadro por cuadro, y que el puño o el pie dibujados lleguen a la zona del golpe).

## Eventos

Uno por hecho del juego, nunca por cuadro. Un golpe que conecta queda en espera mientras dura la ventana del combo (0,75 s) y sale como `ATTACK` o dentro de un `COMBO`: `MATCH_STARTED {stage, rounds}`, `PLAYER_JOINED {character}` por cada uno, y después `ATTACK` (un golpe suelto; fallado o bloqueado va con `damage: 0`), `BLOCK`, `COMBO` (2 o más golpes conectados seguidos, cada uno a menos de 0,75 s del anterior; **reemplaza** a los `ATTACK` de esos golpes, como en el fixture de GameStats, así la suma del daño de un round es la vida que se quitó), `KNOCKDOWN` (el golpe que deja al rival en 0), `ROUND_WON` / `ROUND_DRAW`, `MATCH_PAUSED` / `MATCH_RESUMED`, y al cerrar a la mitad `PLAYER_LEFT` de cada uno. `MATCH_FINISHED` sale una sola vez.

`test/support/scalaRules.ts` es una copia de las reglas de GameStats para fighting (schema y `FightingCheck`); `test/events.test.ts` simula cientos de peleas al azar y revisa que ningún evento se descarte.

## Docker

Se construye desde la raíz del repo (para que Docker vea `sdk/`):

```bash
docker build -f games/fighting/Dockerfile -t gameconsole-game-fighting .
```

En `docker-compose.yml`, el servicio se llama `game-fighting` (el gateway lo busca por ese nombre) y necesita `REGISTRY_URL: "http://registry:8080"`.
