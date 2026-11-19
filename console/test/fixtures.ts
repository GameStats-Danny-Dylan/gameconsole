/** Manifiestos de prueba. Son juegos inventados: la consola no conoce ninguno por nombre. */
import type { GameManifest } from "@gameconsole/sdk";

export function manifest(over: Partial<GameManifest> = {}): GameManifest {
  return {
    id: "fichas",
    name: "Fichas",
    version: "1.0.0",
    description: "Un juego de prueba.",
    gameStatsId: "fichas-stats",
    gameVersion: "1.0",
    entry: "/games/fichas/",
    icon: "/games/fichas/icon.svg",
    players: { min: 1, max: 2 },
    modes: ["vs-cpu", "local-2p"],
    options: [
      { key: "nivel", label: "Nivel", type: "select",
        values: ["a", "b", "c"], labels: ["Bajo", "Medio", "Alto"], default: "b", modes: ["vs-cpu"] },
      { key: "segundos", label: "Tiempo", type: "select",
        values: [0, 15, 30], labels: ["Sin límite", "15 s", "30 s"], default: 0 },
    ],
    protocol: "gameconsole/1",
    ...over,
  };
}
