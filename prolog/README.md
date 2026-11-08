# IA del 4 en línea (SWI-Prolog)

Servicio HTTP que recibe un tablero de 4 en línea y devuelve la mejor columna para la computadora. El contrato está en [`docs/protocolo.md`](../docs/protocolo.md#7-ia-en-prolog).

| Archivo | Qué tiene |
|---|---|
| `connect4.pl` | Las reglas del juego y el algoritmo (minimax con poda alfa-beta) |
| `server.pl` | El servidor HTTP: `POST /connect4/move` y `GET /health` |
| `tests.pl` | 17 pruebas con `plunit` (5 comprueban que cada dificultad juega distinto) |

## Cómo correrlo

```bash
swipl tests.pl       # pruebas
swipl server.pl      # servidor en el puerto 8080 (o el de la variable PORT)
```

## Cómo decide la computadora

1. **Representación.** El tablero es una lista de 7 columnas, cada una con sus fichas de abajo hacia arriba. Soltar una ficha es agregarla al final de su columna (`drop/4`).
2. **Búsqueda (minimax).** La computadora prueba cada columna y, para cada una, imagina la mejor respuesta del rival, después su propia respuesta, y así varias jugadas hacia adelante. Supone que el rival siempre juega lo mejor para él.
   - Se programa como **negamax**: el puntaje siempre es desde el punto de vista del que mueve, y lo que es bueno para uno es el negativo para el otro.
3. **Dificultad = cuánto mira y qué mira** (`difficulty/3`):

   | Dificultad | Jugadas que mira | Qué evalúa | Cómo se nota al jugar |
   |---|---|---|---|
   | Fácil | 1 (solo la suya) | solo sus líneas (`attack`) | Gana si puede, pero **no tapa tus amenazas**: como un principiante |
   | Media | 3 (la suya, la tuya, la suya) | las de los dos (`full`) | Tapa cuando estás por ganar, pero **cae en trampas** de dos amenazas a la vez |
   | Difícil | 6 | las de los dos (`full`) | Ve esas trampas: las esquiva y te las arma |

   Las tres deciden con las mismas reglas y la misma búsqueda, sin azar: cambian solo la profundidad y la evaluación. Las pruebas `dificultades` de `tests.pl` lo comprueban con posiciones concretas.
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
| Fácil (1) | 7 posiciones, ~10 ms | 7, ~2 ms | 7, ~3 ms | 7, ~2 ms |
| Media (3) | 75, ~20 ms | 27, ~10 ms | 35, ~20 ms | 92, ~40 ms |
| Difícil (6) | 1 380, ~0,5 s | 993, ~0,4 s | 1 276, ~0,7 s | 4 429, ~1,7 s |

Fácil y media responden casi al instante, así que el juego espera al menos 0,7 s antes de mostrar la ficha (`MinThinkTime`, un Decorator de la estrategia en `games/connect4/src/ai/MoveStrategy.ts`): si no, la ficha aparecería de golpe. Difícil ya tarda más y casi no espera de más.
