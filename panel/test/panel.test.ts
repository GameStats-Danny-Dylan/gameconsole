import { describe, expect, test } from "vitest";
import { GameStatsClient, type Fetch } from "../src/api/GameStatsClient";
import { buildRows, duration, liveMatches, metricValue, type Overview } from "../src/model";
import { PanelStore } from "../src/store/PanelStore";

/** fetch falso: ruta -> respuesta (número = solo el status). */
function fakeFetch(routes: Record<string, unknown>): Fetch {
  return (async (url: string) => {
    const r = routes[url.replace(/^\/api/, "")];
    if (r === undefined) return new Response("{}", { status: 404 });
    if (typeof r === "number") return new Response("{}", { status: r });
    return new Response(JSON.stringify(r), { status: 200 });
  }) as Fetch;
}

const summary = (gameId: string, matches: number) => ({
  gameId, matches, players: 2, totalEvents: 10 * matches, avgDurationSeconds: 90, avgEventsPerMatch: 10,
  matchesWithoutWinner: 0, winners: [], metrics: {}, actions: {}, patterns: [],
});
const overview: Overview = {
  matches: 5, players: 3, totalEvents: 50, avgDurationSeconds: 90,
  games: [summary("connect4", 4), summary("snake", 1)], topWinners: [], topPatterns: [],
};
const registry = [
  { id: "connect4", name: "4 en línea", gameStatsId: "connect4", entry: "/games/connect4/", icon: "/games/connect4/icon.svg" },
  { id: "tetris", name: "Tetris", gameStatsId: "tetris", entry: "/games/tetris/" },
];
const matches = [
  { matchId: "connect4-a", gameId: "connect4", status: "en_curso", eventCount: 7, connectedPlayers: ["ana", "cpu"] },
  { matchId: "connect4-b", gameId: "connect4", status: "en_curso", eventCount: 3, connectedPlayers: ["beto", "cpu"] },
  { matchId: "tetris-c", gameId: "tetris", status: "en_curso", eventCount: 30, connectedPlayers: ["ana"] },
  { matchId: "connect4-d", gameId: "connect4", status: "enviada", eventCount: 22, connectedPlayers: ["ana", "cpu"] },
];

describe("buildRows", () => {
  test("cruza registry, Scala y Go por gameId; ordena por partidas", () => {
    const rows = buildRows(registry, overview, [{ gameId: "connect4", inProgress: 2 }, { gameId: "tetris", inProgress: 1 }]);
    expect(rows.map((r) => [r.gameId, r.inProgress, r.finished, r.available])).toEqual([
      ["connect4", 2, 4, true],
      ["snake", 0, 1, false],     // terminó partidas pero ya no está registrado
      ["tetris", 1, 0, true],
    ]);
    expect(rows[0].name).toBe("4 en línea");
  });

  test("sin estadísticas de Scala (v1.0) igual muestra los juegos y las en curso", () => {
    const rows = buildRows(registry, null, [{ gameId: "tetris", inProgress: 3 }]);
    expect(rows.find((r) => r.gameId === "tetris")).toMatchObject({ inProgress: 3, finished: 0, summary: null });
  });
});

describe("GameStatsClient (Facade)", () => {
  test("en curso desde /api/games si existe", async () => {
    const c = new GameStatsClient("/api", fakeFetch({ "/games": [{ gameId: "tetris", inProgress: 4 }] }));
    expect(await c.live()).toEqual([{ gameId: "tetris", inProgress: 4 }]);
  });

  test("si /api/games no existe (Go v1.0), cuenta las en_curso de /api/matches", async () => {
    const c = new GameStatsClient("/api", fakeFetch({ "/matches": matches }));
    expect(await c.live()).toEqual([{ gameId: "connect4", inProgress: 2 }, { gameId: "tetris", inProgress: 1 }]);
  });

  test("overview es null si GameStats no tiene /stats; otros errores se propagan", async () => {
    expect(await new GameStatsClient("/api", fakeFetch({})).overview()).toBeNull();
    await expect(new GameStatsClient("/api", fakeFetch({ "/stats/overview": 500 })).overview()).rejects.toThrow("500");
  });
});

describe("PanelStore (Observer)", () => {
  test("publica una foto con todo, y si una fuente falla avisa sin perder las demás", async () => {
    const store = new PanelStore(new GameStatsClient("/api", fakeFetch({
      "/stats/overview": overview, "/registry/games": 503, "/matches": matches,
    })));
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.matches.length));
    const snap = await store.refresh();
    expect(seen).toEqual([4]);
    expect(snap.overview?.matches).toBe(5);
    expect(snap.registry).toEqual([]);
    expect(snap.errors).toHaveLength(1);
    expect(snap.errors[0]).toMatch(/registry/);
    expect(snap.live).toEqual([{ gameId: "connect4", inProgress: 2 }, { gameId: "tetris", inProgress: 1 }]);
  });
});

test("partidas en vivo, duración y métricas en porcentaje", () => {
  expect(liveMatches(matches).map((m) => m.matchId)).toEqual(["tetris-c", "connect4-b", "connect4-a"]);
  expect(duration(45)).toBe("45 s");
  expect(duration(134)).toBe("2 min 14 s");
  expect(metricValue("accuracy", 0.756)).toBe("76 %");
});
