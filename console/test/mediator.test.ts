import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/match/EventBus";
import { frameSrc } from "../src/match/MatchSessionFactory";
import { contractEvent, harness } from "./support/matchFakes";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Una partida cargada esperando READY: si un mensaje se acepta, manda START. */
function waiting() {
  const h = harness();
  const m = h.open();
  m.frame.load();
  const started = () => m.frame.types().includes("START");
  return { ...h, ...m, started };
}

describe("MatchMediator: qué mensajes se aceptan", () => {
  it("acepta el mensaje bien armado de su iframe", () => {
    const { fromGame, started } = waiting();
    fromGame("READY");
    expect(started()).toBe(true);
  });

  it("ignora otro origin", () => {
    const { fromGame, started } = waiting();
    fromGame("READY", {}, { origin: "http://otro-sitio.test" });
    expect(started()).toBe(false);
  });

  it("ignora otro protocol", () => {
    const { fromGame, started } = waiting();
    fromGame("READY", {}, { protocol: "gameconsole/2" });
    expect(started()).toBe(false);
  });

  it("ignora un matchId que no es de ninguna partida", () => {
    const { fromGame, started } = waiting();
    fromGame("READY", {}, { matchId: "fichas-otra" });
    expect(started()).toBe(false);
  });

  it("ignora un mensaje que no viene del iframe de esa partida (otro source)", () => {
    const { fromGame, started } = waiting();
    fromGame("READY", {}, { source: { name: "otra ventana" } });
    fromGame("READY", {}, { source: null });
    expect(started()).toBe(false);
  });

  it("una partida no puede hablar por otra: su matchId con el source de la otra se ignora", () => {
    const h = harness();
    const one = h.open();
    const two = h.open();
    one.frame.load();
    two.frame.load();
    one.fromGame("READY", {}, { matchId: two.session.matchId });   // source = iframe de "one"
    expect(two.frame.types()).toEqual(["INIT"]);
    two.fromGame("READY");
    expect(two.frame.types()).toEqual(["INIT", "START"]);
    expect(one.frame.types()).toEqual(["INIT"]);
  });

  it("ignora un type desconocido, uno de consola y datos que no son objeto", () => {
    const { fromGame, win, started, frame } = waiting();
    fromGame("HELLO");
    fromGame("START");
    win.dispatch({ data: "READY", origin: "http://consola.test", source: frame.window });
    win.dispatch({ data: null, origin: "http://consola.test", source: frame.window });
    expect(started()).toBe(false);
  });

  it("ignora payloads mal armados", () => {
    const { session, fromGame, published } = waiting();
    fromGame("READY");
    fromGame("STATE", { state: "volando" });
    fromGame("GAME_EVENT", { event: contractEvent("fichas-otra") });   // evento de otra partida
    fromGame("GAME_EVENT", {});
    fromGame("FINISHED", { winner: 3, reason: "normal" });
    fromGame("ERROR", { message: "x" });
    expect(published).toEqual([]);
    expect(session.status).toBe("playing");
  });

  it("al cerrarse una sesión deja de recibir mensajes", async () => {
    const { session, fromGame, mediator } = waiting();
    expect(mediator.size).toBe(1);
    await session.stop("user");   // en loading: se quita enseguida
    expect(mediator.size).toBe(0);
    fromGame("READY");
    expect(session.status).toBe("finished");
  });

  it("stop() deja de escuchar la ventana", () => {
    const { mediator, fromGame, started } = waiting();
    mediator.stop();
    fromGame("READY");
    expect(started()).toBe(false);
  });
});

describe("Varias partidas a la vez", () => {
  it("cada una recibe solo lo suyo", () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    a.frame.load(); b.frame.load();
    a.fromGame("READY"); b.fromGame("READY");
    a.session.pause("user");
    b.fromGame("FINISHED", { winner: "ana", reason: "normal" });
    expect(a.session.status).toBe("paused");
    expect(b.session.status).toBe("finished");
    expect(a.session.matchId).not.toBe(b.session.matchId);
  });
});

describe("MatchSessionFactory", () => {
  it("frameSrc agrega el matchId a la entry", () => {
    expect(frameSrc("/games/x/", "x-1")).toBe("/games/x/?matchId=x-1");
    expect(frameSrc("/games/x/?debug=1", "x-1")).toBe("/games/x/?debug=1&matchId=x-1");
  });

  it("Reiniciar: mismos jugadores, modo y opciones, otro matchId con el prefijo del id", () => {
    const h = harness();
    const { session } = h.open();
    const again = h.factory.restart(session);
    expect(again.matchId).not.toBe(session.matchId);
    expect(again.matchId).toMatch(/^fichas-/);
    expect(again.context).toEqual({ ...session.context, matchId: again.matchId });
    expect(again.context.players).not.toBe(session.context.players);   // copia, no el mismo arreglo
    expect(h.frames.at(-1)!.src).toBe(`/games/fichas/?matchId=${again.matchId}`);
    expect(h.mediator.size).toBe(2);
  });
});

describe("EventBus", () => {
  it("entrega a cada suscriptor y permite desuscribirse", () => {
    const bus = new EventBus();
    const got: string[] = [];
    const off = bus.on("state", (p) => got.push(`1:${p.state}`));
    bus.on("state", (p) => got.push(`2:${p.state}`));
    bus.publish("state", { matchId: "m", state: "paused" });
    off();
    bus.publish("state", { matchId: "m", state: "playing" });
    expect(got).toEqual(["1:paused", "2:paused", "2:playing"]);
  });

  it("si un suscriptor falla, los demás reciben igual", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bus = new EventBus();
    const got: unknown[] = [];
    bus.on("finished", () => { throw new Error("x"); });
    bus.on("finished", (p) => got.push(p));
    bus.publish("finished", { matchId: "m", winner: null, reason: "stopped" });
    expect(got).toHaveLength(1);
  });
});
