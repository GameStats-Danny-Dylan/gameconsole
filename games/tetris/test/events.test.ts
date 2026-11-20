/**
 * Los eventos del juego cumplen el contrato y las reglas de GameStats:
 * se juegan partidas al azar (con semilla) por TetrisApp y se revisan con la
 * copia de las reglas de Scala (support/scalaRules.ts), sin red.
 */
import { describe, expect, test } from "vitest";
import { GameStatsAdapter } from "../src/adapter/GameStatsAdapter";
import { TETRIS_ACTIONS, scalaRejections } from "./support/scalaRules";
import { flush, init, rng, setup } from "./support/harness";

describe("GameStatsAdapter", () => {
  const a = new GameStatsAdapter("ana");
  test("cada hecho se vuelve su acción del catálogo", () => {
    expect(a.fromFact({ kind: "linesCleared", lines: 2, points: 300, combo: 1 })).toEqual({
      type: "PLAYER_ACTION", action: "LINES_CLEARED", playerId: "ana", data: { lines: 2, points: 300, combo: 1 },
    });
    expect(a.fromFact({ kind: "placed", piece: "T", hardDrop: true }).data).toEqual({ piece: "T", hardDrop: true });
    expect(a.fromFact({ kind: "topOut" })).toMatchObject({ action: "TOP_OUT", data: {} });
  });

  test("MATCH_STARTED {startLevel}, PLAYER_JOINED y PLAYER_LEFT", () => {
    expect(a.matchStarted(4)).toEqual({ type: "MATCH_STARTED", data: { startLevel: 4 } });
    expect(a.playerJoined()).toMatchObject({ type: "PLAYER_JOINED", playerId: "ana" });
    expect(a.playerLeft()).toMatchObject({ type: "PLAYER_LEFT", playerId: "ana" });
  });
});

describe("las reglas de Scala (copia) detectan lo malo", () => {
  const base = { gameId: "tetris", gameVersion: "1.0", matchId: "m" };
  const ev = (n: number, rest: object) => ({ ...base, eventId: `m-e${n}`, timestamp: new Date(1e12 + n * 1000).toISOString(), ...rest }) as never;
  const head = [
    ev(1, { type: "MATCH_STARTED", data: { startLevel: 3 } }),
    ev(2, { type: "PLAYER_JOINED", playerId: "ana", data: {} }),
  ];
  test("LEVEL_UP no mayor, segundo jugador y eventos después de TOP_OUT", () => {
    const bad = [...head,
      ev(3, { type: "PLAYER_ACTION", action: "LEVEL_UP", playerId: "ana", data: { level: 3 } }),
      ev(4, { type: "PLAYER_JOINED", playerId: "beto", data: {} }),
      ev(5, { type: "PLAYER_ACTION", action: "TOP_OUT", playerId: "ana", data: {} }),
      ev(6, { type: "PLAYER_LEFT", playerId: "ana", data: {} }),
    ];
    expect(scalaRejections(bad)).toHaveLength(3);
  });
});

describe("partidas simuladas", () => {
  /** Juega una partida completa por TetrisApp con entradas al azar. */
  async function simulate(seed: number) {
    const rand = rng(seed * 31 + 7);
    let clock = Date.parse("2026-11-07T12:00:00Z");
    const s = setup(rng(seed), () => (clock += Math.floor(rand() * 400)));
    s.transport.deliver("INIT", init({ startLevel: 1 + Math.floor(rand() * 15) }));
    await flush();
    s.transport.deliver("START");
    const g = s.app.gameRef;
    const stopAt = rand() < 0.3 ? 20 + Math.floor(rand() * 200) : Infinity;
    let paused = false;
    for (let i = 0; i < 4000 && g.status !== "over" && g.status !== "stopped"; i++) {
      if (i >= stopAt) { s.transport.deliver("STOP", { reason: rand() < 0.5 ? "user" : "closed" }); break; }
      const r = rand();
      if (paused) { s.transport.deliver("RESUME"); paused = false; continue; }
      if (r < 0.02) { s.transport.deliver("PAUSE", { reason: rand() < 0.5 ? "user" : "hidden" }); paused = true; continue; }
      if (r < 0.30) g.move(rand() < 0.5 ? "left" : "right");
      else if (r < 0.42) g.rotate(rand() < 0.5 ? "cw" : "ccw");
      else if (r < 0.55) g.softDrop();
      else if (r < 0.60) g.hold();
      else if (r < 0.70) g.hardDrop();
      else s.app.fakeLoop.tick?.(50 + Math.floor(rand() * 300));
    }
    return s;
  }

  test("200 partidas al azar: GameStats no descarta ningún evento", async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const s = await simulate(seed);
      const events = s.transport.events();
      expect(scalaRejections(events), `semilla ${seed}`).toEqual([]);
      expect(events.filter((e) => e.type === "MATCH_FINISHED").length, `semilla ${seed}`).toBeLessThanOrEqual(1);
      events.forEach((e) => e.action && seen.add(e.action));
    }
    // el azar toca casi todo el catálogo (ALL_CLEAR y T_SPIN son raros: se prueban aparte)
    for (const a of TETRIS_ACTIONS.filter((x) => !["ALL_CLEAR", "T_SPIN", "LEVEL_UP", "LINES_CLEARED"].includes(x))) expect(seen, a).toContain(a);
  });
});

describe("líneas, T-spin y niveles pasan las reglas", () => {
  test("pozos con tetris, ALL_CLEAR y LEVEL_UP aceptados", async () => {
    const { EventStamper } = await import("@gameconsole/sdk");
    const { TetrisGame } = await import("../src/game/TetrisGame");
    const { Board } = await import("../src/domain/Board");
    const { PieceBag } = await import("../src/domain/PieceBag");
    class Fixed extends PieceBag {
      constructor(private q: ("I" | "T")[]) { super(rng(1)); }
      override next() { return this.q.length ? this.q.shift()! : super.next(); }
      override peek(n = 1) { return [...this.q, ...super.peek(n)].slice(0, n); }
    }
    let clock = Date.parse("2026-11-07T12:00:00Z");
    const stamper = new EventStamper({ matchId: "tetris-x", gameId: "tetris", gameVersion: "1.0", now: () => (clock += 5) });
    const adapter = new GameStatsAdapter("ana");
    const events = [stamper.stamp(adapter.matchStarted(5)), stamper.stamp(adapter.playerJoined())];
    const g = new TetrisGame({ startLevel: 5, board: Board.fromRows(Array(4).fill(".IIIIIIIII")), bag: new Fixed(["I"]) });
    g.facts.on((f) => events.push(stamper.stamp(adapter.fromFact(f))));
    (g as unknown as { level: { addLines(n: number): void } }).level.addLines(8); // faltan 2 para el nivel 6
    g.start();
    g.rotate("cw"); while (g.move("left")); g.hardDrop();
    events.push(stamper.stamp(adapter.matchFinished("stopped")));
    const actions = events.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["LINES_CLEARED", "ALL_CLEAR", "LEVEL_UP", "HARD_DROP", "PIECE_PLACED"]));
    expect(scalaRejections(events)).toEqual([]);
  });
});
