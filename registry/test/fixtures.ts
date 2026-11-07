import type { GameManifest } from "../src/manifest.js";

/** Manifiesto válido del 4 en línea (el ejemplo de la sección 2 del protocolo). */
export function connect4(overrides: Partial<GameManifest> = {}): GameManifest {
  return {
    id: "connect4",
    name: "4 en línea",
    version: "1.0.0",
    description: "Conecta cuatro fichas antes que tu rival.",
    gameStatsId: "connect4",
    gameVersion: "1.0",
    entry: "/games/connect4/",
    icon: "/games/connect4/icon.png",
    players: { min: 1, max: 2 },
    modes: ["vs-cpu", "local-2p"],
    options: [
      { key: "difficulty", label: "Dificultad", type: "select",
        values: ["easy", "medium", "hard"], default: "medium", modes: ["vs-cpu"] },
    ],
    protocol: "gameconsole/1",
    ...overrides,
  };
}

export const tetris = (): GameManifest => connect4({
  id: "tetris", name: "Tetris", gameStatsId: "tetris", entry: "/games/tetris/",
  icon: undefined, players: { min: 1, max: 1 }, modes: ["solo"], options: [],
});
