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

Arriba hay una **pestaña por juego** y una **General** (cada una con cuántas partidas tiene y un punto verde si se está jugando). Así las estadísticas generales y las de cada juego quedan separadas, como pide el enunciado, y no hace falta bajar por una página larga.

| Pestaña | Qué tiene |
|---|---|
| **General** | Totales (partidas jugándose ahora, terminadas, jugadores contando a la computadora, duración promedio); **clasificación general** de todos los juegos (partidas, ganadas, perdidas, sin ganador y % de victorias con una barra; medallas para los 3 primeros); **jugadas destacadas** de todos los juegos; y las **partidas que se están jugando**, en vivo |
| **Un juego** | Sus totales (partidas jugándose y terminadas = **instancias del juego**, duración promedio); su **clasificación** a todo el ancho, con una columna propia del juego (por ejemplo "Amenazas por partida" en el 4 en línea); debajo, sus **jugadas destacadas** y los **números del juego** (el promedio y el récord de cada métrica en una partida); y sus partidas en curso |

**Juegos sin ganador (Tetris):** es de un jugador y termina cuando las piezas llegan arriba, así que nadie gana ni pierde. Su pestaña muestra una **clasificación por puntaje** (Partidas, Mejor puntaje y Puntos por partida), sin las columnas de ganadas, perdidas y % de victorias, que siempre serían 0. El panel solo reordena lo que devuelve GameStats (`rankByScore` en `model.ts`), no calcula nada nuevo.

En las tablas cada número va centrado bajo su título, y la columna del juego y el % de victorias van separadas con una línea para que no se lean como una sola.

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
- Las pestañas son botones: cambian de color al pasar el mouse y la elegida queda en verde. Se recuerda cuál estaba abierta (mientras dure la pestaña del navegador).
- **Abierto aparte** tiene el botón **← Volver a DnD Games**, que lleva a la consola.

## 6. Pruebas y comandos

```bash
npm ci
npm test          # 7 pruebas: el cliente de GameStats, el store que consulta y avisa, y el armado de cada juego
npm run dev       # necesita el gateway (docker compose) para /api
```

Con Docker se construye desde la **raíz** del repo, porque usa el tema del SDK: `docker build -f panel/Dockerfile .`
