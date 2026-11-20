/**
 * La pelea dentro de la consola: una consola de mentira manda los mensajes del
 * protocolo (INIT, START, PAUSE, RESUME, STOP) por el SDK y se revisa lo que
 * vuelve: READY, STATE, los eventos sellados y FINISHED. Los cuadros se
 * avanzan a mano y las teclas se aprietan con un teclado de mentira.
 */
import { ConsoleChannel, PROTOCOL, type ContractEvent, type GameMessage, type Transport } from "@gameconsole/sdk";
import { describe, expect, test } from "vitest";
import { FightingApp } from "../src/game/FightingApp";
import { OUTRO_SECONDS } from "../src/game/FightingGame";
import type { FightView, FrameScheduler, InputPort } from "../src/game/ports";
import { SLOT1_KEYS, SLOT2_KEYS } from "../src/input/ControlScheme";
import { FakeInput, FakeView, ManualFrames } from "./support/fakes";
import { scalaRejections } from "./support/scalaRules";

const ORIGIN = "http://consola.test";
const MATCH_ID = "fighting-app-1";

class FakeTransport implements Transport {
  readonly sent: GameMessage[] = [];
  private handlers = new Set<(data: unknown, origin: string) => void>();
  send(message: unknown) { this.sent.push(message as GameMessage); }
  subscribe(h: (data: unknown, origin: string) => void) { this.handlers.add(h); return () => this.handlers.delete(h); }
  deliver(type: string, payload: unknown = {}) {
    for (const h of [...this.handlers]) h({ protocol: PROTOCOL, type, matchId: MATCH_ID, payload }, ORIGIN);
  }
  types() { return this.sent.map((m) => m.type); }
  events(): ContractEvent[] { return this.sent.flatMap((m) => (m.type === "GAME_EVENT" ? [m.payload.event] : [])); }
  names() { return this.events().map((e) => e.action ?? e.type); }
}

/** FightingApp sin DOM: vista, teclado y cuadros de mentira. */
class TestApp extends FightingApp {
  readonly view = new FakeView();
  readonly input = new FakeInput();
  readonly frames = new ManualFrames();
  protected override mountView(): FightView { return this.view; }
  protected override mountInput(): InputPort { return this.input; }
  protected override scheduler(): FrameScheduler { return this.frames; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const ANA = { playerId: "ana", name: "Ana", kind: "human", slot: 1 };
const BETO = { playerId: "beto", name: "Beto", kind: "human", slot: 2 };

function setup() {
  const transport = new FakeTransport();
  const app = new TestApp(null as unknown as HTMLElement, {
    manifest: { id: "fighting", gameStatsId: "fighting", gameVersion: "1.0" },
    channel: new ConsoleChannel(transport, ORIGIN, MATCH_ID),
  }).listen();
  return { transport, app };
}

const init = (rounds: unknown = 1, mode = "local-2p", players: unknown[] = [ANA, BETO]) =>
  ({ gameId: "fighting", matchId: MATCH_ID, mode, players, options: { rounds } });

/** Los dos se juntan caminando y Ana golpea hasta ganar (Beto no hace nada). */
function anaBeatsBeto(app: TestApp): void {
  for (let i = 0; i < 60 * 120 && app.status === "playing"; i++) {
    const [a, b] = app.view.vm!.match.fighters;
    if (b.x - a.x > 100) app.input.press(SLOT1_KEYS.right);
    else { app.input.release(SLOT1_KEYS.right); if (i % 8 === 0) app.input.press(SLOT1_KEYS.attack); }
    app.frames.tick();
  }
}

describe("FightingApp (sobre el SDK)", () => {
  test("pelea completa: READY, MATCH_STARTED con stage y rounds, eventos válidos y FINISHED con el ganador", async () => {
    const { transport, app } = setup();
    transport.deliver("INIT", init(1));
    await flush();
    expect(transport.types()).toContain("READY");

    transport.deliver("START");
    expect(app.frames.pending).toBe(true); // arrancó el ciclo
    anaBeatsBeto(app);

    const events = transport.events();
    expect(events[0]).toMatchObject({ type: "MATCH_STARTED", data: { stage: "dojo", rounds: 1 } });
    expect(events.slice(1, 3).map((e) => [e.playerId, e.data?.character])).toEqual([["ana", "brasa"], ["beto", "marea"]]);
    expect(transport.names().slice(-3)).toEqual(["KNOCKDOWN", "ROUND_WON", "MATCH_FINISHED"]);
    expect(events.every((e) => e.matchId === MATCH_ID && e.gameId === "fighting" && e.gameVersion === "1.0")).toBe(true);
    expect(scalaRejections(events)).toEqual([]);
    expect(transport.sent.filter((m) => m.type === "FINISHED").map((m) => m.payload)).toEqual([{ winner: "ana", reason: "normal" }]);
    expect(app.status).toBe("finished");

    // Sigue dibujando el final un momento y después el ciclo se detiene.
    app.frames.run(OUTRO_SECONDS + 1);
    expect(app.frames.pending).toBe(false);
  });

  test("PAUSE detiene el ciclo y el reloj; RESUME sigue; sin acciones durante la pausa", async () => {
    const { transport, app } = setup();
    transport.deliver("INIT", init(3));
    await flush();
    transport.deliver("START");
    app.frames.run(3);
    const time = app.view.vm!.match.currentRound.timeLeft;

    app.input.press(SLOT2_KEYS.left);
    transport.deliver("PAUSE", { reason: "hidden" });
    expect(app.frames.pending).toBe(false);
    expect(app.input.isDown(SLOT2_KEYS.left)).toBe(false); // al pausar se sueltan las teclas
    app.frames.run(5); // no corre nada
    expect(app.view.vm!.match.currentRound.timeLeft).toBe(time);
    expect(app.view.vm!.status).toBe("paused");

    transport.deliver("PAUSE", { reason: "user" }); // repetida: se ignora
    transport.deliver("RESUME");
    expect(app.frames.pending).toBe(true);
    app.frames.tick(5000); // el primer cuadro después de reanudar no avanza aunque haya pasado mucho tiempo
    expect(app.view.vm!.match.currentRound.timeLeft).toBe(time);
    app.frames.run(1);
    expect(app.view.vm!.match.currentRound.timeLeft).toBeLessThan(time);

    const names = transport.names();
    expect(names.filter((n) => n === "MATCH_PAUSED")).toHaveLength(1);
    const p = names.indexOf("MATCH_PAUSED");
    expect(names[p + 1]).toBe("MATCH_RESUMED");
    expect(transport.events()[p].data).toEqual({ reason: "hidden" });
    expect(scalaRejections(transport.events())).toEqual([]);
  });

  test("un cuadro muy largo (pestaña lenta) avanza a lo sumo MAX_DT", async () => {
    const { transport, app } = setup();
    transport.deliver("INIT", init(3));
    await flush();
    transport.deliver("START");
    app.frames.run(2);
    const before = app.view.vm!.match.currentRound.timeLeft;
    app.frames.tick(3000);
    expect(before - app.view.vm!.match.currentRound.timeLeft).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  test("STOP a media pelea: PLAYER_LEFT de cada uno, MATCH_FINISHED y un solo FINISHED sin ganador", async () => {
    const { transport, app } = setup();
    transport.deliver("INIT", init(3));
    await flush();
    transport.deliver("START");
    app.frames.run(2.5);
    transport.deliver("STOP", { reason: "closed" });
    transport.deliver("STOP", { reason: "closed" });
    app.frames.run(1);

    expect(transport.names().slice(-3)).toEqual(["PLAYER_LEFT", "PLAYER_LEFT", "MATCH_FINISHED"]);
    expect(transport.events().at(-1)!.data).toEqual({ reason: "stopped" });
    expect(transport.sent.filter((m) => m.type === "FINISHED").map((m) => m.payload)).toEqual([{ winner: null, reason: "stopped" }]);
    expect(app.frames.pending).toBe(false);
    expect(scalaRejections(transport.events())).toEqual([]);
  });

  test("STOP antes de START: sin eventos, solo FINISHED", async () => {
    const { transport } = setup();
    transport.deliver("INIT", init(3));
    await flush();
    transport.deliver("STOP", { reason: "user" });
    expect(transport.events()).toEqual([]);
    expect(transport.sent.find((m) => m.type === "FINISHED")?.payload).toEqual({ winner: null, reason: "stopped" });
  });

  test("rounds que no son 1, 3 o 5: se usa 3", async () => {
    const { transport } = setup();
    transport.deliver("INIT", init("7"));
    await flush();
    transport.deliver("START");
    expect(transport.events()[0].data).toEqual({ stage: "dojo", rounds: 3 });
  });

  test.each([
    ["un modo que la pelea no tiene", init(3, "vs-cpu", [ANA])],
    ["un solo jugador", init(3, "local-2p", [ANA])],
    ["la computadora", init(3, "local-2p", [ANA, { ...BETO, kind: "cpu" }])],
  ])("%s: ERROR fatal y sin READY", async (_, payload) => {
    const { transport } = setup();
    transport.deliver("INIT", payload);
    await flush();
    expect(transport.types()).not.toContain("READY");
    expect(transport.sent.find((m) => m.type === "ERROR")?.payload).toMatchObject({ fatal: true });
  });
});
