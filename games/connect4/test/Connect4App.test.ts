/**
 * El 4 en línea dentro de la consola: una consola de mentira manda los
 * mensajes del protocolo (INIT, START, PAUSE, RESUME, STOP) por el SDK y se
 * revisa lo que vuelve: READY, STATE, los eventos sellados y FINISHED.
 */
import { ConsoleChannel, PROTOCOL, type ContractEvent, type GameMessage, type Transport } from "@gameconsole/sdk";
import { describe, expect, test } from "vitest";
import type { AiDecision, MoveStrategy } from "../src/ai/MoveStrategy";
import { Connect4App } from "../src/game/Connect4App";
import type { Connect4View, ViewHandlers, ViewModel } from "../src/game/ports";
import { scalaRejections } from "./support/scalaRules";

const ORIGIN = "http://consola.test";
const MATCH_ID = "connect4-app-1";

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
}

/** IA que siempre juega en la primera columna libre de la derecha. */
class RightmostAi implements MoveStrategy {
  async choose(board: { canDrop(c: number): boolean }): Promise<AiDecision> {
    const column = [7, 6, 5, 4, 3, 2, 1].find((c) => board.canDrop(c))!;
    return { column, engine: "prolog-minimax", depth: 1, score: 0, nodes: 1, ms: 1 };
  }
}

class FakeView implements Connect4View {
  h!: ViewHandlers;
  vm!: ViewModel;
  bind(h: ViewHandlers) { this.h = h; }
  render(vm: ViewModel) { this.vm = vm; }
}

/** Connect4App con la vista de mentira (sin DOM). */
class TestApp extends Connect4App {
  readonly view = new FakeView();
  protected override mountView() { return this.view; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const transport = new FakeTransport();
  const app = new TestApp(null as unknown as HTMLElement, {
    manifest: { id: "connect4", gameStatsId: "connect4", gameVersion: "1.0" },
    channel: new ConsoleChannel(transport, ORIGIN, MATCH_ID),
  }, new RightmostAi()).listen();
  return { transport, app };
}

const init = (mode: string, players: unknown[]) => ({
  gameId: "connect4", matchId: MATCH_ID, mode, players, options: { difficulty: "easy", turnSeconds: 0 },
});
const ANA = { playerId: "ana", name: "Ana", kind: "human", slot: 1 };
const BETO = { playerId: "beto", name: "Beto", kind: "human", slot: 2 };

describe("Connect4App (sobre el SDK)", () => {
  test("partida completa contra la computadora: READY, eventos válidos para GameStats y FINISHED con ganador", async () => {
    const { transport, app } = setup();
    transport.deliver("INIT", init("vs-cpu", [ANA]));
    await flush();
    expect(transport.types()).toContain("READY");

    transport.deliver("START");
    transport.deliver("PAUSE", { reason: "hidden" });
    transport.deliver("RESUME");
    // Ana juega siempre en la columna 1; la IA, a la derecha: Ana gana en vertical.
    for (let i = 0; i < 4; i++) {
      app.view.h.column(1);
      for (let k = 0; k < 5; k++) await flush();
    }

    const events = transport.events();
    expect(events[0].type).toBe("MATCH_STARTED");
    expect(events.at(-1)!.type).toBe("MATCH_FINISHED");
    expect(events.every((e) => e.matchId === MATCH_ID && e.gameId === "connect4")).toBe(true);
    // timestamps estrictamente crecientes (SDK) y ninguna regla de Scala rota
    const ms = events.map((e) => Date.parse(e.timestamp));
    expect(ms.every((t, i) => i === 0 || t > ms[i - 1])).toBe(true);
    expect(scalaRejections(events)).toEqual([]);
    const finished = transport.sent.find((m) => m.type === "FINISHED");
    expect(finished?.payload).toEqual({ winner: "ana", reason: "normal" });
    expect(app.status).toBe("finished");
  });

  test("STOP a media partida: PLAYER_LEFT de cada persona, MATCH_FINISHED y un solo FINISHED", async () => {
    const { transport } = setup();
    transport.deliver("INIT", init("local-2p", [ANA, BETO]));
    await flush();
    transport.deliver("START");
    transport.deliver("STOP", { reason: "closed" });
    transport.deliver("STOP", { reason: "closed" });

    const names = transport.events().map((e) => e.action ?? e.type);
    expect(names.slice(-3)).toEqual(["PLAYER_LEFT", "PLAYER_LEFT", "MATCH_FINISHED"]);
    expect(transport.types().filter((t) => t === "FINISHED")).toHaveLength(1);
    expect(scalaRejections(transport.events())).toEqual([]);
  });

  test("un modo que el 4 en línea no tiene: ERROR fatal y sin READY", async () => {
    const { transport } = setup();
    transport.deliver("INIT", init("solo", [ANA]));
    await flush();
    expect(transport.types()).not.toContain("READY");
    expect(transport.sent.find((m) => m.type === "ERROR")?.payload).toMatchObject({ fatal: true });
  });
});
