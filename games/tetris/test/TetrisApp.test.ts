/** El Tetris dentro de la consola: una consola de mentira manda INIT / START / PAUSE / RESUME / STOP. */
import { describe, expect, test } from "vitest";
import { TetrisApp } from "../src/game/TetrisApp";
import { scalaRejections } from "./support/scalaRules";
import { flush, init, playing, setup, rng } from "./support/harness";

describe("protocolo", () => {
  test("INIT responde READY; START emite MATCH_STARTED {startLevel}, PLAYER_JOINED y la primera pieza", async () => {
    const { transport } = setup(rng(1));
    transport.deliver("INIT", init({ startLevel: 7 }));
    await flush();
    expect(transport.types()).toContain("READY");
    expect(transport.events()).toHaveLength(0);
    transport.deliver("START");
    const ev = transport.events();
    expect(ev[0]).toMatchObject({ type: "MATCH_STARTED", gameId: "tetris", gameVersion: "1.0", matchId: "tetris-test-1", data: { startLevel: 7 } });
    expect(ev[1]).toMatchObject({ type: "PLAYER_JOINED", playerId: "ana" });
    expect(ev[2]).toMatchObject({ type: "PLAYER_ACTION", action: "PIECE_SPAWNED", playerId: "ana" });
  });

  test("startLevel por defecto 1 y se acota a 1-15", async () => {
    for (const [opt, expected] of [[undefined, 1], [99, 15], [0, 1], ["4", 4]] as const) {
      const s = await playing(opt === undefined ? {} : { startLevel: opt });
      expect(s.transport.events()[0].data).toEqual({ startLevel: expected });
    }
  });

  test("modo o jugadores inválidos: ERROR fatal y no arranca", async () => {
    for (const bad of [init({}, { mode: "vs-cpu" }), init({}, { players: [] })]) {
      const { transport } = setup();
      transport.deliver("INIT", bad);
      await flush();
      expect(transport.sent.some((m) => m.type === "ERROR" && m.payload.fatal)).toBe(true);
      expect(transport.types()).not.toContain("READY");
    }
  });

  test("PAUSE y RESUME emiten MATCH_PAUSED (con reason) y MATCH_RESUMED y detienen / reanudan el ciclo", async () => {
    const s = await playing();
    expect(s.app.fakeLoop.running).toBe(true);
    s.transport.deliver("PAUSE", { reason: "hidden" });
    expect(s.app.fakeLoop.running).toBe(false);
    expect(s.app.last?.status).toBe("paused");
    s.transport.deliver("RESUME");
    expect(s.app.fakeLoop.running).toBe(true);
    const ev = s.transport.events();
    expect(ev.find((e) => e.type === "MATCH_PAUSED")?.data).toEqual({ reason: "hidden" });
    expect(ev.some((e) => e.type === "MATCH_RESUMED")).toBe(true);
    expect(scalaRejections(ev)).toEqual([]);
  });

  test("las teclas no hacen nada en pausa (no salen acciones)", async () => {
    const s = await playing();
    s.transport.deliver("PAUSE", { reason: "user" });
    const n = s.transport.events().length;
    s.app.gameRef.move("left"); s.app.gameRef.hardDrop();
    expect(s.transport.events()).toHaveLength(n);
  });

  test("STOP en medio de la partida: PLAYER_LEFT, MATCH_FINISHED una vez y FINISHED {null, stopped}", async () => {
    const s = await playing();
    s.app.gameRef.hardDrop();
    s.transport.deliver("STOP", { reason: "user" });
    s.transport.deliver("STOP", { reason: "closed" });
    const ev = s.transport.events();
    expect(ev.slice(-2).map((e) => e.type)).toEqual(["PLAYER_LEFT", "MATCH_FINISHED"]);
    expect(ev.filter((e) => e.type === "MATCH_FINISHED")).toHaveLength(1);
    const fin = s.transport.sent.filter((m) => m.type === "FINISHED");
    expect(fin).toHaveLength(1);
    expect(fin[0].payload).toEqual({ winner: null, reason: "stopped" });
    expect(s.app.fakeLoop.running).toBe(false);
    expect(s.app.attached).toBe(false);
    expect(scalaRejections(ev)).toEqual([]);
  });

  test("STOP antes de START: ningún evento, solo FINISHED", async () => {
    const { transport } = setup();
    transport.deliver("INIT", init());
    await flush();
    transport.deliver("STOP", { reason: "user" });
    expect(transport.events()).toHaveLength(0);
    expect(transport.sent.filter((m) => m.type === "FINISHED")).toHaveLength(1);
  });

  test("game over: TOP_OUT, MATCH_FINISHED una vez, FINISHED {null, normal} y sin PLAYER_LEFT", async () => {
    const s = await playing({ startLevel: 1 }, rng(5));
    let guard = 0;
    while (s.app.gameRef.status === "playing" && guard++ < 100) s.app.gameRef.hardDrop();
    const ev = s.transport.events();
    expect(ev.at(-2)).toMatchObject({ action: "TOP_OUT", playerId: "ana", data: {} });
    expect(ev.at(-1)).toMatchObject({ type: "MATCH_FINISHED" });
    expect(ev.some((e) => e.type === "PLAYER_LEFT")).toBe(false);
    expect(s.transport.sent.filter((m) => m.type === "FINISHED").map((m) => m.payload)).toEqual([{ winner: null, reason: "normal" }]);
    // STOP o PAUSE después de perder no agregan nada
    const n = ev.length;
    s.transport.deliver("PAUSE", { reason: "hidden" });
    s.transport.deliver("STOP", { reason: "closed" });
    expect(s.transport.events()).toHaveLength(n);
    expect(scalaRejections(s.transport.events())).toEqual([]);
  });

  test("la caída por gravedad no genera eventos (nada por frame)", async () => {
    const s = await playing();
    const n = s.transport.events().length;
    for (let i = 0; i < 8; i++) s.app.fakeLoop.tick?.(100);
    expect(s.transport.events()).toHaveLength(n);
  });

  test("es un GameApp", async () => {
    expect((await playing()).app).toBeInstanceOf(TetrisApp);
  });
});
