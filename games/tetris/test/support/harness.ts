/** Una consola de mentira y un TetrisApp sin DOM, para probar el protocolo y los eventos. */
import { ConsoleChannel, PROTOCOL, type ContractEvent, type GameMessage, type Transport } from "@gameconsole/sdk";
import type { Snapshot } from "../../src/game/TetrisGame";
import { TetrisApp } from "../../src/game/TetrisApp";
import type { TetrisGame } from "../../src/game/TetrisGame";
import type { GameView } from "../../src/ui/CanvasView";
import type { Loop } from "../../src/ui/GameLoop";
import type { KeyboardInput } from "../../src/ui/KeyboardInput";
import type { Random } from "../../src/domain/PieceBag";

export const ORIGIN = "http://consola.test";
export const MATCH_ID = "tetris-test-1";

export class FakeTransport implements Transport {
  readonly sent: GameMessage[] = [];
  private handlers = new Set<(data: unknown, origin: string) => void>();
  send(message: unknown) { this.sent.push(message as GameMessage); }
  subscribe(h: (data: unknown, origin: string) => void) { this.handlers.add(h); return () => this.handlers.delete(h); }
  deliver(type: string, payload: unknown = {}) {
    for (const h of [...this.handlers]) h({ protocol: PROTOCOL, type, matchId: MATCH_ID, payload }, ORIGIN);
  }
  types() { return this.sent.map((m) => m.type); }
  events(): ContractEvent[] { return this.sent.flatMap((m) => (m.type === "GAME_EVENT" ? [m.payload.event] : [])); }
  actions() { return this.events().map((e) => e.action ?? e.type); }
}

export class FakeLoop implements Loop {
  tick: ((dt: number) => void) | null = null;
  start(t: (dt: number) => void) { this.tick = t; }
  stop() { this.tick = null; }
  get running() { return this.tick !== null; }
}

export class TestApp extends TetrisApp {
  readonly fakeLoop = new FakeLoop();
  last: Snapshot | null = null;
  gameRef!: TetrisGame;
  attached = false;
  protected override mountView(): GameView { return { render: (s) => { this.last = s; } }; }
  protected override createLoop() { return this.fakeLoop; }
  protected override createInput(game: TetrisGame): KeyboardInput {
    this.gameRef = game;
    return { attach: () => { this.attached = true; }, detach: () => { this.attached = false; } } as unknown as KeyboardInput;
  }
}

export const init = (options: Record<string, unknown> = { startLevel: 1 }, over: Record<string, unknown> = {}) => ({
  gameId: "tetris", matchId: MATCH_ID, mode: "solo",
  players: [{ playerId: "ana", name: "Ana", kind: "human", slot: 1 }],
  options, ...over,
});

export const flush = () => new Promise((r) => setTimeout(r, 0));

export function setup(random?: Random, now?: () => number) {
  const transport = new FakeTransport();
  const app = new TestApp(null as unknown as HTMLElement, {
    manifest: { id: "tetris", gameStatsId: "tetris", gameVersion: "1.0" },
    channel: new ConsoleChannel(transport, ORIGIN, MATCH_ID),
    random, now,
  });
  app.listen();
  return { transport, app };
}

/** INIT + READY + START. */
export async function playing(options?: Record<string, unknown>, random?: Random) {
  const s = setup(random);
  s.transport.deliver("INIT", init(options));
  await flush();
  s.transport.deliver("START");
  return s;
}

/** Generador con semilla (mulberry32). */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
