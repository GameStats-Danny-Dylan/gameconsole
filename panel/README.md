# Panel de estadísticas

Muestra, mientras se juega, las estadísticas que calcula **GameStats**. No calcula nada por su cuenta: solo consulta y presenta. Está en `/panel/`.

## Contenido

- [Qué muestra](#qué-muestra)
- [De dónde sale cada dato](#de-dónde-sale-cada-dato)
- [Cómo está armado](#cómo-está-armado)
- [Cómo correrlo](#cómo-correrlo)

## Qué muestra

1. **Totales:** partidas jugándose ahora, partidas terminadas, jugadores y duración promedio de una partida.
2. **Clasificación general:** jugadores ordenados por victorias, con partidas jugadas, ganadas, perdidas, sin ganador y porcentaje de victorias.
3. **Jugadas destacadas:** los patrones más frecuentes que detecta GameStats, explicados con palabras de jugador.
4. **Por juego:** cuántas instancias se jugaron y cuántas están en curso, la clasificación de ese juego y sus números (por ejemplo, amenazas por partida en el 4 en línea).
5. **Partidas que se están jugando:** cada partida en curso, en vivo.

Se actualiza cada **3 s**. Las estadísticas generales y las de cada juego están en secciones separadas, como pide el enunciado.

## De dónde sale cada dato

| Dato | Servicio | Ruta |
|---|---|---|
| Totales, clasificación general, patrones | GameStats Scala | `/api/stats/overview` |
| Estadísticas y clasificación de un juego | GameStats Scala | `/api/stats/games/{gameId}` |
| Partidas en curso por juego | GameStats Go | `/api/games` (si no existe, cuenta las `en_curso` de `/api/matches`) |
| Partidas en vivo | GameStats Go | `/api/matches` |
| Nombre e ícono de cada juego | registry | `/api/registry/games` |

Cada fuente falla por separado: si una no responde, el resto del panel sigue funcionando.

## Cómo está armado

| Archivo | Qué hace | Patrón |
|---|---|---|
| `src/api/GameStatsClient.ts` | Todas las consultas en una sola clase | Facade |
| `src/store/PanelStore.ts` | Consulta cada 3 s y avisa a quien escuche | Observer |
| `src/ui/PanelView.ts` | Dibuja la página (solo con `textContent`, sin HTML del servidor) | — |
| `src/model.ts` | Tipos y textos para el jugador (nombres de métricas y patrones) | — |

Usa el tema claro/oscuro del SDK (`@gameconsole/sdk/theme`), el mismo de la consola y los juegos.

## Cómo correrlo

```bash
npm ci
npm test          # 7 pruebas
npm run dev       # necesita el gateway (docker compose) para /api
```

Con Docker se construye desde la **raíz** del repo: `docker build -f panel/Dockerfile .`
