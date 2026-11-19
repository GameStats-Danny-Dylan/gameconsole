/**
 * Una consola de mentira para las pruebas: un transporte que guarda lo que
 * manda el juego y permite entregarle mensajes como si vinieran de la consola.
 */
import { ConsoleChannel, type Transport } from "../../src/client/MessageChannel";
import { GameApp } from "../../src/client/GameApp";
import {
  PROTOCOL, type ContractEvent, type GameMessage, type MatchContext, type PauseReason, type StopReason,
} from "../../src/protocol";

export const ORIGIN = "http://consola.test";
export const MATCH_ID = "connect4-1111";

export class FakeTransport implements Transport {
  readonly sent: GameMessage[] = [];
  private handlers = new Set<(data: unknown, origin: string) => void>();

  send(message: unknown, targetOrigin: string): void {
    if (targetOrigin !== ORIGIN) throw new Error(`mandado a otro origen: ${targetOrigin}`);
    this.sent.push(message as GameMessage);
  }

  subscribe(handler: (data: unknown, origin: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Entrega un mensaje "tal cual llega por postMessage". */
  deliverRaw(data: unknown, origin = ORIGIN): void {
    for (const h of [...this.handlers]) h(data, origin);
  }

  /** Entrega un mensaje bien armado de la consola. */
  deliver(type: string, payload: unknown = {}, matchId = MATCH_ID): void {
    this.deliverRaw({ protocol: PROTOCOL, type, matchId, payload });
  }

  types(): string[] {
    return this.sent.map((m) => m.type);
  }

  events(): ContractEvent[] {
    return this.sent.flatMap((m) => (m.type === "GAME_EVENT" ? [m.payload.event] : []));
  }

  states(): string[] {
    return this.sent.flatMap((m) => (m.type === "STATE" ? [m.payload.state] : []));
  }
}

export const context = (over: Partial<MatchContext> = {}): MatchContext => ({
  gameId: "connect4",
  matchId: MATCH_ID,
  mode: "vs-cpu",
  players: [
    { playerId: "ana", name: "Ana", kind: "human", slot: 1 },
    { playerId: "cpu", name: "Computadora", kind: "cpu", slot: 2 },
  ],
  options: { difficulty: "hard" },
  ...over,
});

/** Deja correr las promesas pendientes (onInit asíncrono). */
export const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Un juego mínimo que se comporta como dice el protocolo. */
export class TestGame extends GameApp {
  readonly calls: string[] = [];
  initDelay = 0;
  initError: Error | null = null;
  /** Si al recibir STOP el juego llama a finish() él mismo. */
  finishesOnStop = true;

  protected async onInit(ctx: MatchContext): Promise<void> {
    this.calls.push(`init:${ctx.matchId}`);
    if (this.initDelay) await new Promise((r) => setTimeout(r, this.initDelay));
    if (this.initError) throw this.initError;
  }

  protected onStart(): void {
    this.calls.push("start");
    this.emit({ type: "MATCH_STARTED", data: {} });
    for (const p of this.context!.players)
      this.emit({ type: "PLAYER_JOINED", playerId: p.playerId, data: { color: p.slot === 1 ? "red" : "yellow" } });
  }

  protected onPause(reason: PauseReason): void {
    this.calls.push(`pause:${reason}`);
    this.emit({ type: "MATCH_PAUSED", data: { reason } });
  }

  protected onResume(): void {
    this.calls.push("resume");
    this.emit({ type: "MATCH_RESUMED", data: {} });
  }

  protected onStop(reason: StopReason): void {
    this.calls.push(`stop:${reason}`);
    if (this.status === "ready") {
      if (this.finishesOnStop) this.finish(null, "stopped");
      return;
    }
    for (const p of this.context!.players)
      if (p.kind === "human") this.emit({ type: "PLAYER_LEFT", playerId: p.playerId, data: {} });
    this.emit({ type: "MATCH_FINISHED", data: {} });
    if (this.finishesOnStop) this.finish(null, "stopped");
  }

  // Para que las pruebas hagan de "lógica del juego".
  play(column: number): void {
    this.host.emit({ type: "PLAYER_ACTION", action: "DISC_DROPPED", playerId: "ana", data: { column } });
  }
  win(winner: string): void {
    this.host.emit({ type: "MATCH_FINISHED", data: {} });
    this.host.finish(winner, "normal");
  }
}

export function setup(options: { matchId?: string | null; now?: () => number } = {}) {
  const transport = new FakeTransport();
  const channel = new ConsoleChannel(transport, ORIGIN, options.matchId === undefined ? MATCH_ID : options.matchId);
  const game = new TestGame({
    manifest: { id: "connect4", gameStatsId: "connect4", gameVersion: "1.0" },
    channel,
    now: options.now,
  }).listen();
  return { transport, channel, game };
}

/** INIT + esperar READY. */
export async function ready(options?: Parameters<typeof setup>[0]) {
  const s = setup(options);
  s.transport.deliver("INIT", context());
  await flush();
  return s;
}

/** INIT + READY + START. */
export async function playing(options?: Parameters<typeof setup>[0]) {
  const s = await ready(options);
  s.transport.deliver("START");
  return s;
}
