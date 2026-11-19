/**
 * Piezas falsas para probar las partidas sin navegador: un iframe que guarda
 * lo que le manda la consola y una ventana donde se "postean" mensajes.
 */
import { PROTOCOL, type ConsoleMessage, type ContractEvent, type MatchContext } from "@gameconsole/sdk";
import { EventBus, type BusTopic, type BusTopics } from "../../src/match/EventBus";
import type { MatchFrame } from "../../src/match/MatchFrame";
import { MatchMediator, type MessageLike, type MessageTarget } from "../../src/match/MatchMediator";
import { MatchSessionFactory } from "../../src/match/MatchSessionFactory";
import { MatchContextFactory } from "../../src/domain/MatchContextFactory";
import { manifest } from "../fixtures";

export const ORIGIN = "http://consola.test";

export class FakeFrame implements MatchFrame {
  /** Una ventana propia por iframe: es lo que llega como event.source. */
  readonly window = { name: "ventana del juego" };
  readonly posted: ConsoleMessage[] = [];
  readonly origins: string[] = [];
  focused = 0;
  removed = false;
  private loadListeners: (() => void)[] = [];

  constructor(readonly src: string, readonly title: string) {}

  post(message: ConsoleMessage, targetOrigin: string): void {
    this.posted.push(message);
    this.origins.push(targetOrigin);
  }
  onLoad(listener: () => void): void { this.loadListeners.push(listener); }
  focus(): void { this.focused++; }
  remove(): void { this.removed = true; }

  /** Simula que el iframe terminó de cargar. */
  load(): void { for (const l of this.loadListeners) l(); }

  types(): string[] { return this.posted.map((m) => m.type); }
}

export class FakeWindow implements MessageTarget {
  private listeners = new Set<(e: MessageLike) => void>();
  addEventListener(_t: "message", l: (e: MessageLike) => void) { this.listeners.add(l); }
  removeEventListener(_t: "message", l: (e: MessageLike) => void) { this.listeners.delete(l); }
  dispatch(e: MessageLike): void { for (const l of [...this.listeners]) l(e); }
}

/** Todo armado: bus, mediador sobre una ventana falsa y la fábrica con iframes falsos. */
export function harness() {
  const win = new FakeWindow();
  const bus = new EventBus();
  const mediator = new MatchMediator(win, ORIGIN);
  mediator.start();
  const frames: FakeFrame[] = [];
  let n = 0;
  const factory = new MatchSessionFactory({
    bus, mediator, origin: ORIGIN,
    createFrame: (src, title) => { const f = new FakeFrame(src, title); frames.push(f); return f; },
    contexts: new MatchContextFactory(() => `uuid-${++n}`),
  });

  const published: { topic: BusTopic; payload: unknown }[] = [];
  for (const topic of ["game-event", "state", "finished"] as const)
    bus.on(topic, (payload: BusTopics[typeof topic]) => published.push({ topic, payload }));

  const open = (ctx: Partial<MatchContext> = {}) => {
    const m = manifest();
    const context: MatchContext = {
      gameId: m.id, matchId: `fichas-uuid-${++n}`, mode: "vs-cpu",
      players: [
        { playerId: "ana", name: "Ana", kind: "human", slot: 1 },
        { playerId: "cpu", name: "CPU", kind: "cpu", slot: 2 },
      ],
      options: { segundos: 15 },
      ...ctx,
    };
    const session = factory.create(m, context);
    const frame = frames.at(-1)!;
    /** El juego manda un mensaje como lo haría por postMessage. */
    const fromGame = (type: string, payload: unknown = {}, over: Partial<MessageLike> & { matchId?: string; protocol?: string } = {}) =>
      win.dispatch({
        data: { protocol: over.protocol ?? PROTOCOL, type, matchId: over.matchId ?? session.matchId, payload },
        origin: over.origin ?? ORIGIN,
        source: "source" in over ? over.source : frame.window,
      });
    return { session, frame, fromGame };
  };

  return { win, bus, mediator, factory, frames, published, open };
}

export function contractEvent(matchId: string, n = 1): ContractEvent {
  return {
    eventId: `${matchId}-e${n}`, timestamp: new Date(1_700_000_000_000 + n).toISOString(),
    gameId: "fichas-stats", gameVersion: "1.0", matchId, type: "MATCH_STARTED", data: {},
  };
}
