/**
 * LiveStats: lee de GameStats lo de cada juego para las tarjetas del menú,
 * sin calcular nada, y sigue funcionando si una fuente falla.
 */
import { describe, expect, test } from "vitest";
import { LiveStats } from "../src/catalog/LiveStats";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response("no", { status: 404 });
    return r();
  };
  return { fn, calls };
}

describe("LiveStats", () => {
  test("junta jugadas y líder (Scala) con las partidas en curso (Go), por gameId de GameStats", async () => {
    const { fn } = fakeFetch({
      "/api/stats/overview": () => json({ games: [
        { gameId: "connect4", matches: 27, winners: [{ playerId: "cpu", wins: 15 }, { playerId: "danny", wins: 9 }] },
        { gameId: "tetris", matches: 3, winners: [] },
      ] }),
      "/api/games": () => json([{ gameId: "connect4", inProgress: 2 }, { gameId: "fighting", inProgress: 1 }]),
    });
    const snap = await new LiveStats("/api", fn).refresh();
    expect(snap.get("connect4")).toEqual({ inProgress: 2, played: 27, leader: "cpu" });
    expect(snap.get("tetris")).toEqual({ inProgress: 0, played: 3, leader: null });
    expect(snap.get("fighting")).toEqual({ inProgress: 1, played: 0, leader: null });
  });

  test("sin /games (GameStats viejo): cuenta las en_curso de /matches", async () => {
    const { fn } = fakeFetch({
      "/api/matches": () => json([
        { gameId: "tetris", status: "en_curso" }, { gameId: "tetris", status: "en_curso" }, { gameId: "tetris", status: "enviada" },
      ]),
    });
    const snap = await new LiveStats("/api", fn).refresh();
    expect(snap.get("tetris")?.inProgress).toBe(2);
  });

  test("si GameStats no responde, no se cae: queda vacío y avisa igual", async () => {
    const seen: number[] = [];
    const live = new LiveStats("/api", async () => { throw new Error("sin red"); });
    live.subscribe((s) => seen.push(s.size));
    await live.refresh();
    expect(seen).toEqual([0, 0]);
  });
});
