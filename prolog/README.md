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
- Respuesta: `{"column": 4, "score": 12, "depth": 6, "nodes": 4821, "ms": 85}` (columna elegida, puntaje, profundidad, posiciones revisadas y tiempo). Con un pedido inválido responde `400` con el motivo.

## Cómo decide la computadora

1. **Representación.** El tablero es una lista de 7 columnas, cada una con sus fichas de abajo hacia arriba. Soltar una ficha es agregarla al final de su columna (`drop/4`).
2. **Búsqueda (minimax).** La computadora prueba cada columna y, para cada una, imagina la mejor respuesta del rival, después su propia respuesta, y así varias jugadas hacia adelante. Supone que el rival siempre juega lo mejor para él.
   - Se programa como **negamax**: el puntaje siempre es desde el punto de vista del que mueve, y lo que es bueno para uno es el negativo para el otro.
3. **Dificultad = cuánto mira y qué mira** (`difficulty/3`):

   | Dificultad | Jugadas que mira | Qué evalúa | Cómo se nota al jugar |
   |---|---|---|---|
   | Fácil | 1 (solo la suya) | solo estar cerca del centro (`basic`) | Gana si ve un 4 en línea, pero **no lo arma a propósito ni tapa los tuyos**: como un principiante |
   | Media | 1 (solo la suya) | las de los dos (`full`) | Arma líneas y **tapa las amenazas que se ven en el tablero**, pero no planea: **no ve trampas** de varias jugadas |
   | Difícil | 6 | las de los dos (`full`) | Ve esas trampas: las esquiva y te las arma |

   Las tres deciden con las mismas reglas y la misma búsqueda, sin azar: cambian solo la profundidad y la evaluación. Las pruebas `dificultades` de `tests.pl` lo comprueban con posiciones concretas.

   **Cómo se calibró (19-nov).** Con media mirando 3 jugadas, a una persona normal le ganaba casi siempre y no se distinguía de difícil. Se midió cada dificultad contra un jugador simulado "casual" (gana si puede, tapa si debe, no regala una victoria y si no juega al azar cerca del centro), jugando la computadora en segundo lugar como en la consola:

   | Dificultad | La computadora gana | La persona gana |
   |---|---|---|
   | Fácil | 10 % | 90 % |
   | Media (1 jugada, `full`) | 50 % | 40 % (10 % empates) |
   | Media anterior (3 jugadas) | 80 % | 15 % |
   | Difícil | 95 % | 5 % |

   Entre ellas, con aperturas al azar: media le gana a fácil 22–7 y difícil a media 17–2.

   Primero fácil era `attack` (solo armar sus líneas, sin tapar). Contra la IA perdía, pero a una persona la presionaba más que media: armaba una línea en cada turno y obligaba a defender todo el tiempo. Por eso se cambió a `basic`.
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
| Fácil (1 jugada) | 7 posiciones, ~10 ms | 7, ~2 ms | 7, ~3 ms | 7, ~2 ms |
| Media (1 jugada) | 7 posiciones, ~10 ms | 7, ~7 ms | 7, ~6 ms | 7, ~5 ms |
| Difícil (6 jugadas) | 1 380, ~0,5 s | 993, ~0,4 s | 1 276, ~0,7 s | 4 429, ~1,7 s |

Fácil y media responden casi al instante, así que el juego espera al menos 0,7 s antes de mostrar la ficha (`MinThinkTime`, un Decorator de la estrategia en `games/connect4/src/ai/MoveStrategy.ts`): si no, la ficha aparecería de golpe. Difícil ya tarda más y casi no espera de más.

## Cómo correrlo

```bash
swipl tests.pl       # 18 pruebas
swipl server.pl      # servidor en el puerto 8080 (o el de la variable PORT)
```

Con Docker: `docker build -t gameconsole-prolog . ; docker run -p 8091:8080 gameconsole-prolog`
