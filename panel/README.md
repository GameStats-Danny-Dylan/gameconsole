# Panel de estadísticas

Muestra, mientras se juega, las estadísticas que calcula **GameStats**: generales, por juego, la clasificación de jugadores y las partidas en curso. **No calcula nada por su cuenta:** solo consulta y presenta, como pide el enunciado.

Se puede ver de dos formas:

- **dentro de la consola**, con el botón **📊 Estadísticas** (panel lateral, al lado de las partidas);
- **aparte**, en `/panel/`, con un botón **← Volver a DnD Games**.

---

## Contenido

1. [Qué muestra](#1-qué-muestra)
2. [De dónde sale cada dato](#2-de-dónde-sale-cada-dato)
3. [Cómo se actualiza](#3-cómo-se-actualiza)
4. [Cómo está armado](#4-cómo-está-armado)
5. [Diseño](#5-diseño)
6. [Pruebas y comandos](#6-pruebas-y-comandos)

---

## 1. Qué muestra

| Sección | Qué tiene |
|---|---|
| **Totales** | Partidas jugándose ahora, partidas terminadas, jugadores (contando a la computadora) y cuánto dura una partida en promedio |
| **Clasificación general** | Todos los jugadores de todos los juegos, ordenados por victorias: partidas, ganadas, perdidas, sin ganador y porcentaje de victorias con una barra. Medallas de oro, plata y bronce para los 3 primeros |
| **Jugadas destacadas** | Los patrones que más detecta GameStats (por ejemplo "Doble amenaza" o "Victoria rápida"), explicados con palabras de jugador |
| **Por juego** | Una tarjeta por juego: partidas jugándose y terminadas (**instancias de cada juego**), duración promedio, su propia clasificación (con una columna del juego, por ejemplo "Amenazas por partida" en el 4 en línea) y "Los números de una partida" (lo normal y el récord de cada métrica) |
| **Partidas que se están jugando** | Cada partida en curso, en vivo |

Las estadísticas generales y las de cada juego están en secciones separadas, como pide el enunciado.

## 2. De dónde sale cada dato

| Dato | Servicio | Ruta |
|---|---|---|
| Totales, clasificación general, patrones | GameStats Scala | `/api/stats/overview` |
| Estadísticas y clasificación de un juego | GameStats Scala | `/api/stats/games/{gameId}` |
| Partidas en curso por juego | GameStats Go | `/api/games` (si no existe, cuenta las `en_curso` de `/api/matches`) |
| Partidas en vivo | GameStats Go | `/api/matches` |
| Nombre e ícono de cada juego | registry | `/api/registry/games` |

Las rutas `/stats/...` y `/games` las agregó **GameStats v1.1** para este proyecto, respetando la separación de responsabilidades: el cálculo queda en GameStats.

## 3. Cómo se actualiza

- Consulta todas las fuentes **cada 3 s** y redibuja.
- Cada fuente falla por separado: si una no responde, el resto del panel sigue funcionando y la cabecera lo avisa.
- Si la pestaña queda en segundo plano, deja de consultar; al volver, sigue.
- La cabecera muestra "En vivo · hace N s".

## 4. Cómo está armado

| Archivo | Qué hace | Patrón |
|---|---|---|
| `src/api/GameStatsClient.ts` | Todas las consultas en una sola clase | Facade |
| `src/store/PanelStore.ts` | Consulta cada 3 s y avisa a quien escuche | Observer |
| `src/ui/PanelView.ts` | Dibuja la página (solo con `textContent`, nunca HTML del servidor) | — |
| `src/model.ts` | Tipos y textos para el jugador: nombres de métricas y patrones, "Computadora" en vez de `cpu` | — |

## 5. Diseño

- Mismo diseño que la consola (temática **DnD Games**): letras Poppins e Inter, rojo navidad, dorado y verde pino.
- Modo claro tipo cabaña (kraft y crema) y modo oscuro de noche de invierno. El tema se comparte con la consola y los juegos.
- **Dentro de la consola** se oculta la cabecera propia (la pone la consola) y la tabla se compacta para entrar en el panel lateral sin desplazarse.
- **Abierto aparte** tiene el botón **← Volver a DnD Games**, que lleva a la consola.

## 6. Pruebas y comandos

```bash
npm ci
npm test          # 7 pruebas: el cliente de GameStats, el store que consulta y avisa, y el armado de cada juego
npm run dev       # necesita el gateway (docker compose) para /api
```

Con Docker se construye desde la **raíz** del repo, porque usa el tema del SDK: `docker build -f panel/Dockerfile .`
