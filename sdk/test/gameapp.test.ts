/**
 * GameApp: estados de la partida, eventos y FINISHED (protocolo, secciones 4, 5 y 9).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { context, flush, playing, ready, setup } from "./support/fakes";

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("transiciones de estado", () => {
  test("recorrido normal: loading → ready → playing → paused → playing → finished", async () => {
    const { transport, game } = setup();
    expect(game.status).toBe("loading");

    transport.deliver("INIT", context());
    await flush();
    expect(game.status).toBe("ready");
    expect(transport.types().slice(0, 2)).toEqual(["READY", "STATE"]);

    transport.deliver("START");
    expect(game.status).toBe("playing");
    transport.deliver("PAUSE", { reason: "hidden" });
    expect(game.status).toBe("paused");
    transport.deliver("RESUME");
    expect(game.status).toBe("playing");
    game.win("ana");
    expect(game.status).toBe("finished");

    expect(transport.states()).toEqual(["ready", "playing", "paused", "playing", "finished"]);
    expect(game.calls).toEqual(["init:connect4-1111", "start", "pause:hidden", "resume"]);
  });

  test("onInit asíncrono: READY llega cuando termina, no antes", async () => {
    const { transport, game } = setup();
    game.initDelay = 20;
    transport.deliver("INIT", context());
    await flush();
    expect(game.status).toBe("loading");
    expect(transport.types()).not.toContain("READY");
    await new Promise((r) => setTimeout(r, 30));
    expect(game.status).toBe("ready");
    expect(transport.types()).toContain("READY");
  });

  test("mientras corre onInit, START, STOP y otro INIT se ignoran", async () => {
    const { transport, game } = setup();
    game.initDelay = 10;
    transport.deliver("INIT", context());
    transport.deliver("INIT", context());
    transport.deliver("START");
    transport.deliver("STOP", { reason: "user" });
    await new Promise((r) => setTimeout(r, 20));
    expect(game.calls).toEqual(["init:connect4-1111"]);
    expect(game.status).toBe("ready");
  });

  test("onInit que falla: ERROR fatal y sin READY", async () => {
    const { transport, game } = setup();
    game.initError = new Error("no cargó el tablero");
    transport.deliver("INIT", context());
    await flush();
    expect(transport.types()).toEqual(["ERROR"]);
    expect(transport.sent[0].payload).toEqual({ message: "no se pudo preparar la partida: no cargó el tablero", fatal: true });
    expect(game.status).toBe("loading");
  });

  test("INIT de otro juego: ERROR fatal", async () => {
    const { transport, game } = setup();
    transport.deliver("INIT", context({ gameId: "tetris" }));
    await flush();
    expect(transport.types()).toEqual(["ERROR"]);
    expect(game.calls).toEqual([]);
  });

  test.each([
    ["START en loading", "loading", "START", {}],
    ["PAUSE en loading", "loading", "PAUSE", { reason: "user" }],
    ["STOP en loading", "loading", "STOP", { reason: "user" }],
    ["PAUSE en ready", "ready", "PAUSE", { reason: "user" }],
    ["RESUME en ready", "ready", "RESUME", {}],
    ["START en playing", "playing", "START", {}],
    ["RESUME en playing", "playing", "RESUME", {}],
    ["PAUSE en paused", "paused", "PAUSE", { reason: "user" }],
    ["START en paused", "paused", "START", {}],
  ] as const)("%s se ignora", async (_n, from, type, payload) => {
    const s = from === "loading" ? setup() : await ready();
    if (from === "playing" || from === "paused") s.transport.deliver("START");
    if (from === "paused") s.transport.deliver("PAUSE", { reason: "user" });
    const before = { calls: [...s.game.calls], sent: s.transport.sent.length };

    s.transport.deliver(type, payload);
    await flush();
    expect(s.game.status).toBe(from);
    expect(s.game.calls).toEqual(before.calls);
    expect(s.transport.sent.length).toBe(before.sent);
  });

  test("en finished se ignora todo", async () => {
    const { transport, game } = await playing();
    game.win("ana");
    const sent = transport.sent.length;
    for (const [type, payload] of [["START", {}], ["PAUSE", { reason: "user" }], ["RESUME", {}], ["STOP", { reason: "user" }], ["INIT", context()]] as const)
      transport.deliver(type, payload);
    await flush();
    expect(game.status).toBe("finished");
    expect(transport.sent.length).toBe(sent);
  });
});

describe("STOP", () => {
  test("desde ready: sin eventos, solo FINISHED con winner null", async () => {
    const { transport, game } = await ready();
    transport.deliver("STOP", { reason: "user" });
    expect(game.status).toBe("finished");
    expect(transport.events()).toEqual([]);
    expect(transport.sent.at(-1)).toMatchObject({ type: "FINISHED", payload: { winner: null, reason: "stopped" } });
  });

  test("desde playing: PLAYER_LEFT, MATCH_FINISHED y después FINISHED", async () => {
    const { transport } = await playing();
    transport.deliver("STOP", { reason: "closed" });
    const tail = transport.sent.slice(-4).map((m) => (m.type === "GAME_EVENT" ? m.payload.event.type : m.type));
    expect(tail).toEqual(["PLAYER_LEFT", "MATCH_FINISHED", "STATE", "FINISHED"]);
  });

  test("desde paused también cierra", async () => {
    const { transport, game } = await playing();
    transport.deliver("PAUSE", { reason: "user" });
    transport.deliver("STOP", { reason: "user" });
    expect(game.status).toBe("finished");
    expect(transport.types().filter((t) => t === "FINISHED")).toHaveLength(1);
  });

  test("si el juego no llama a finish(), el SDK manda FINISHED igual (una sola vez)", async () => {
    const { transport, game } = await playing();
    game.finishesOnStop = false;
    transport.deliver("STOP", { reason: "user" });
    expect(game.status).toBe("finished");
    expect(transport.sent.filter((m) => m.type === "FINISHED")).toEqual([
      expect.objectContaining({ payload: { winner: null, reason: "stopped" } }),
    ]);
  });
});

describe("eventos hacia GameStats", () => {
  test("START emite MATCH_STARTED y PLAYER_JOINED ya sellados", async () => {
    const { transport } = await playing();
    const events = transport.events();
    expect(events.map((e) => e.type)).toEqual(["MATCH_STARTED", "PLAYER_JOINED", "PLAYER_JOINED"]);
    expect(events[0]).toMatchObject({
      eventId: "connect4-1111-e1", matchId: "connect4-1111", gameId: "connect4", gameVersion: "1.0",
    });
  });

  test("el gameId de los eventos es el gameStatsId, no el id del manifiesto", async () => {
    const { ConsoleChannel } = await import("../src/client/MessageChannel");
    const { FakeTransport, TestGame, ORIGIN, MATCH_ID } = await import("./support/fakes");
    const transport = new FakeTransport();
    const game = new TestGame({
      manifest: { id: "cuatro", gameStatsId: "connect4", gameVersion: "2.0" },
      channel: new ConsoleChannel(transport, ORIGIN, MATCH_ID),
    }).listen();
    transport.deliver("INIT", context({ gameId: "cuatro" }));
    await flush();
    transport.deliver("START");
    expect(game.status).toBe("playing");
    expect(transport.events()[0]).toMatchObject({ gameId: "connect4", gameVersion: "2.0" });
  });

  test("timestamps estrictamente crecientes aunque el reloj no avance", async () => {
    const { transport, game } = await playing({ now: () => Date.parse("2026-11-17T12:00:00.000Z") });
    for (let c = 1; c <= 7; c++) game.play(c);
    const times = transport.events().map((e) => Date.parse(e.timestamp));
    expect(times.length).toBe(10);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBe(times[i - 1] + 1);
  });

  test("eventIds consecutivos e1, e2, e3…", async () => {
    const { transport, game } = await playing();
    game.play(4);
    game.play(5);
    expect(transport.events().map((e) => e.eventId)).toEqual(
      [1, 2, 3, 4, 5].map((n) => `connect4-1111-e${n}`));
  });

  test("un solo MATCH_FINISHED: el segundo se descarta", async () => {
    const { transport, game } = await playing();
    game.host.emit({ type: "MATCH_FINISHED", data: {} });
    game.host.emit({ type: "MATCH_FINISHED", data: {} });
    transport.deliver("STOP", { reason: "user" }); // el juego intenta otro PLAYER_LEFT + MATCH_FINISHED
    expect(transport.events().filter((e) => e.type === "MATCH_FINISHED")).toHaveLength(1);
    expect(transport.events().filter((e) => e.type === "PLAYER_LEFT")).toHaveLength(0);
  });

  test("emit después de MATCH_FINISHED o con la partida terminada se descarta", async () => {
    const { transport, game } = await playing();
    game.win("ana");
    const count = transport.events().length;
    game.play(3);
    game.host.emit({ type: "PLAYER_LEFT", playerId: "ana" });
    expect(transport.events().length).toBe(count);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("after-match-finished"));
  });

  test("emit con la partida terminada sin MATCH_FINISHED (STOP desde ready) se descarta", async () => {
    const { transport, game } = await ready();
    transport.deliver("STOP", { reason: "user" });
    game.play(1);
    expect(transport.events()).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("not-playing"));
  });

  test("emit antes de START se descarta", async () => {
    const { transport, game } = await ready();
    game.play(1);
    expect(transport.events()).toEqual([]);
  });

  test("en pausa se puede emitir (por ejemplo, MATCH_PAUSED y PLAYER_LEFT)", async () => {
    const { transport } = await playing();
    transport.deliver("PAUSE", { reason: "user" });
    expect(transport.events().at(-1)).toMatchObject({ type: "MATCH_PAUSED", data: { reason: "user" } });
  });
});

describe("FINISHED", () => {
  test("sale una sola vez, después de MATCH_FINISHED", async () => {
    const { transport, game } = await playing();
    game.win("ana");
    game.host.finish("cpu", "normal");
    transport.deliver("STOP", { reason: "user" });
    const finished = transport.sent.filter((m) => m.type === "FINISHED");
    expect(finished).toEqual([expect.objectContaining({ payload: { winner: "ana", reason: "normal" } })]);
    const lastEvent = transport.sent.map((m) => m.type).lastIndexOf("GAME_EVENT");
    expect(transport.sent.findIndex((m) => m.type === "FINISHED")).toBeGreaterThan(lastEvent);
  });

  test("finish() antes de INIT no hace nada", () => {
    const { transport, game } = setup();
    game.host.finish(null, "normal");
    expect(game.status).toBe("loading");
    expect(transport.sent).toEqual([]);
  });

  test("error() manda ERROR sin cambiar el estado", async () => {
    const { transport, game } = await playing();
    game.host.error("IA: sin respuesta", false);
    expect(game.status).toBe("playing");
    expect(transport.sent.at(-1)).toMatchObject({ type: "ERROR", payload: { message: "IA: sin respuesta", fatal: false } });
  });

  test("un paso del juego que lanza un error se avisa como ERROR fatal", async () => {
    const { transport, game } = await ready();
    (game as unknown as { onStart: () => void }).onStart = () => { throw new Error("se rompió"); };
    transport.deliver("START");
    expect(transport.sent.at(-1)).toMatchObject({ type: "ERROR", payload: { message: "falló START: se rompió", fatal: true } });
  });
});
