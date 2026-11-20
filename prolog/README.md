# IA del 4 en línea (SWI-Prolog)

Servicio HTTP que recibe un tablero de 4 en línea y devuelve la mejor columna para la computadora. Es la parte del proyecto que cumple "usuario contra computadora con decisiones en Prolog": el juego le manda el estado y usa la respuesta.

## Contenido

- [Archivos](#archivos)
- [API](#api)
- [Cómo decide la computadora](#cómo-decide-la-computadora)
- [Rendimiento](#rendimiento-medido-en-una-laptop)
- [Cómo correrlo](#cómo-correrlo)

## Archivos

| Archivo | Qué tiene |
|---|---|
| `connect4.pl` | Las reglas del juego y el algoritmo (minimax con poda alfa-beta) |
| `server.pl` | El servidor HTTP: `POST /connect4/move` y `GET /health` |
| `tests.pl` | 18 pruebas con `plunit` (6 comprueban que cada dificultad juega distinto) |
| `Dockerfile` | Imagen `swipl:10.0.2`: corre las pruebas al construir y arranca el servidor |

## API

Por el gateway: `POST /api/ai/connect4/move` (contrato en [`docs/protocolo.md` §7](../docs/protocolo.md#7-ia-en-prolog)).

```json
{ "board": [["red"], [], ["yellow", "red"], ["yellow"], [], [], []],
  "player": "yellow",
  "difficulty": "hard" }
```

- `board`: 7 columnas, cada una con sus fichas **de abajo hacia arriba**.
- Respuesta: `{"column": 4, "score": 12, "depth": 3, "nodes": 81, "ms": 35}` (columna elegida, puntaje, profundidad, posiciones revisadas y tiempo). Con un pedido inválido responde `400` con el motivo.

## Cómo decide la computadora

1. **Representación.** El tablero es una lista de 7 columnas, cada una con sus fichas de abajo hacia arriba. Soltar una ficha es agregarla al final de su columna (`drop/4`).
2. **Búsqueda (minimax).** La computadora prueba cada columna y, para cada una, imagina la mejor respuesta del rival, después su propia respuesta, y así varias jugadas hacia adelante. Supone que el rival siempre juega lo mejor para él.
   - Se programa como **negamax**: el puntaje siempre es desde el punto de vista del que mueve, y lo que es bueno para uno es el negativo para el otro.
3. **Dificultad = cuánto mira y qué mira** (`difficulty/3`):

   | Dificultad | Jugadas que mira | Qué evalúa | Cómo se nota al jugar |
   |---|---|---|---|
   | Fácil | 1 (solo la suya) | solo **sus** líneas, con poco peso (`lines(1, 1)`) | Casi siempre juega al centro y arma alguna línea sin querer. Gana si ve un 4 en línea, pero **nunca tapa los tuyos**: como un principiante |
   | Media | 1 (solo la suya) | solo las líneas de 3 **del rival** (`block`) | Juega a la defensiva: **tapa cualquier línea de 3 tuya**, aunque tenga un hueco, pero no arma las suyas a propósito ni ve trampas |
   | Difícil | 3 (la suya, la tuya y otra suya) | sus líneas (`lines(5, 2)`) | Ve lo que pasa a 2 jugadas: tapa, **arma amenazas dobles** y no cae en las trampas cortas |

   Las tres deciden con las mismas reglas y la misma búsqueda, sin azar: cambian solo la profundidad y qué cuenta la evaluación. Las pruebas `dificultades` de `tests.pl` lo comprueban con posiciones concretas.

   **Cómo se calibró (20-nov).** La meta era que la computadora ganara más o menos el 15 %, el 50 % y el 85 % de las partidas. Se midió contra un jugador simulado "casual" (gana si puede, tapa si debe, no regala una victoria y si no juega al azar cerca del centro), jugando la computadora en segundo lugar como en la consola, 200 partidas por dificultad (dos semillas de 100):

   | Dificultad | La computadora gana | La persona gana |
   |---|---|---|
   | Fácil | 15–16 % | 84 % |
   | Media | 46–48 % | 48–49 % (el resto, empates) |
   | Difícil | 84–86 % | 14–16 % |

   Otras combinaciones que se probaron y por qué no quedaron:

   | Jugadas y evaluación | Gana | Por qué no |
   |---|---|---|
   | 1, solo el centro (fácil anterior) | 6–10 % | Demasiado fácil |
   | 1, sus líneas con pesos 5 y 2 | 33 % | Fácil quedaba muy fuerte |
   | 1, las de los dos (`full`, media anterior) | 60 % | Media un poco fuerte |
   | 2, las de los dos | 96 % | Igual que mirar 3 o más: el jugador casual no ve trampas de 2 jugadas |
   | 6, las de los dos (difícil anterior) | ~95 % | Difícil casi imposible |
   | 4, sus líneas | 99 % | Igual |
4. **Evaluación.** Cuando se acaba la profundidad, el tablero se puntúa recorriendo las 69 líneas posibles de 4 casillas:

   | En una línea hay… | Puntos |
   |---|---|
   | 3 fichas mías y 1 vacía | +5 |
   | 2 mías y 2 vacías | +2 |
   | 3 del rival y 1 vacía (amenaza) | −4 (solo en `full`) |
   | cada ficha mía en la columna del centro | +3 |

   Ganar vale 1 000 000 más la profundidad que quedaba: así prefiere **ganar lo antes posible** y, si va a perder, **perder lo más tarde posible**.
5. **Poda alfa-beta.** Si una jugada ya es peor que otra que se encontró antes, no se siguen revisando sus respuestas: el rival nunca permitiría llegar ahí. Además se prueban primero las columnas del centro, que suelen ser las mejores, así la poda corta antes.
6. **Ganar ya, sin buscar.** En cada posición se revisa primero si el que mueve puede ganar con una sola ficha; si puede, ese es el valor y no se busca más. Sin esto, cuando había que tapar una amenaza, difícil revisaba 21 000 posiciones (9 s); con esto, unas 1 000 (0,4 s).

## Rendimiento (medido en una laptop)

| Dificultad | Tablero vacío | Hay que tapar | Mitad de partida | Trampa de dos amenazas |
|---|---|---|---|---|
| Fácil (1 jugada) | 7 posiciones, ~4 ms | 7, ~4 ms | 7, ~3 ms | 7, ~2 ms |
| Media (1 jugada) | 7 posiciones, ~2 ms | 7, ~3 ms | 7, ~2 ms | 7, ~3 ms |
| Difícil (3 jugadas) | 81, ~35 ms | 27, ~15 ms | 123, ~55 ms | 111, ~45 ms |

Las tres responden casi al instante, así que el juego espera al menos 0,7 s antes de mostrar la ficha (`MinThinkTime`, un Decorator de la estrategia en `games/connect4/src/ai/MoveStrategy.ts`): si no, la ficha aparecería de golpe. (Cuando difícil miraba 6 jugadas tardaba hasta 1,7 s.)

## Cómo correrlo

```bash
swipl tests.pl       # 18 pruebas
swipl server.pl      # servidor en el puerto 8080 (o el de la variable PORT)
```

Con Docker: `docker build -t gameconsole-prolog . ; docker run -p 8091:8080 gameconsole-prolog`
