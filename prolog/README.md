# IA del 4 en línea (SWI-Prolog)

Servicio HTTP que recibe un tablero de 4 en línea y devuelve la mejor columna para la computadora. El contrato está en [`docs/protocolo.md`](../docs/protocolo.md#7-ia-en-prolog).

| Archivo | Qué tiene |
|---|---|
| `connect4.pl` | Las reglas del juego y el algoritmo (minimax con poda alfa-beta) |
| `server.pl` | El servidor HTTP: `POST /connect4/move` y `GET /health` |
| `tests.pl` | 12 pruebas con `plunit` |

## Cómo correrlo

```bash
swipl tests.pl       # pruebas
swipl server.pl      # servidor en el puerto 8080 (o el de la variable PORT)
```

## Cómo decide la computadora

1. **Representación.** El tablero es una lista de 7 columnas, cada una con sus fichas de abajo hacia arriba. Soltar una ficha es agregarla al final de su columna (`drop/4`).
2. **Búsqueda (minimax).** La computadora prueba cada columna y, para cada una, imagina la mejor respuesta del rival, después su propia respuesta, y así varias jugadas hacia adelante. Supone que el rival siempre juega lo mejor para él.
   - Se programa como **negamax**: el puntaje siempre es desde el punto de vista del que mueve, y lo que es bueno para uno es el negativo para el otro.
3. **Profundidad según la dificultad.** Fácil mira 2 jugadas adelante, media 4 y difícil 6.
4. **Evaluación.** Cuando se acaba la profundidad, el tablero se puntúa recorriendo las 69 líneas posibles de 4 casillas:

   | En una línea hay… | Puntos |
   |---|---|
   | 3 fichas mías y 1 vacía | +5 |
   | 2 mías y 2 vacías | +2 |
   | 3 del rival y 1 vacía (amenaza) | −4 |
   | cada ficha mía en la columna del centro | +3 |

   Ganar vale 1 000 000 más la profundidad que quedaba: así prefiere **ganar lo antes posible** y, si va a perder, **perder lo más tarde posible**.
5. **Poda alfa-beta.** Si una jugada ya es peor que otra que se encontró antes, no se siguen revisando sus respuestas: el rival nunca permitiría llegar ahí. Además se prueban primero las columnas del centro, que suelen ser las mejores, así la poda corta antes.

## Rendimiento (medido en una laptop)

| Dificultad | Tablero vacío | Mitad de partida |
|---|---|---|
| Fácil (2) | 20 posiciones, ~17 ms | — |
| Media (4) | 177 posiciones, ~34 ms | — |
| Difícil (6) | 1 369 posiciones, ~260 ms | 3 504 posiciones, ~640 ms |
