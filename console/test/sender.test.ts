/**
 * EventSender (protocolo, sección 6): lotes, una cola por partida, reintentos,
 * rechazos, cierre de respaldo y sendBeacon. Con un transporte falso y relojes
 * falsos de Vitest, sin red.
 */
import { EventStamper, type ContractEvent, type EventType } from "@gameconsole/sdk";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EventBus } from "../src/match/EventBus";
import { EventSender } from "../src/sending/EventSender";
import type { EventTransport, SendResult } from "../src/sending/EventTransport";
import { BackoffPolicy } from "../src/sending/RetryPolicy";
import { harness } from "./support/matchFakes";

class FakeTransport implements EventTransport {
  readonly batches: ContractEvent[][] = [];
  readonly beacons: ContractEvent[][] = [];
  /** Lo que responde cada envío; si se acaba, "ok". */
  replies: (SendResult | "hang")[] = [];
  /** Partidas para las que GameStats "no responde". */
  readonly down = new Set<string>();
  readonly times: number[] = [];
  private hanging: ((r: SendResult) => void)[] = [];

  send(batch: readonly ContractEvent[]): Promise<SendResult> {
    this.batches.push([...batch]);
    this.times.push(Date.now());
    if (this.down.has(batch[0].matchId)) return Promise.resolve({ kind: "retry", error: "sin conexión" });
    const r = this.replies.shift() ?? { kind: "ok", accepted: batch.length, rejected: [] };
    if (r === "hang") return new Promise((resolve) => this.hanging.push(resolve));
    return Promise.resolve(r);
  }
  beacon(batch: readonly ContractEvent[]): boolean { this.beacons.push([...batch]); return true; }
  release(): void { for (const r of this.hanging.splice(0)) r({ kind: "ok", accepted: 1, rejected: [] }); }
  all(): ContractEvent[] { return this.batches.flat(); }
}

/** Eventos de una partida, sellados como lo haría el SDK. */
function match(matchId: string, start = 1_700_000_000_000) {
  let t = start;
  const s = new EventStamper({ matchId, gameId: "connect4", gameVersion: "1.0", now: () => (t += 5) });
  const ev = (type: EventType, playerId?: string, data?: Record<string, unknown>) =>
    s.stamp({ type, ...(playerId ? { playerId } : {}), ...(data ? { data } : {}) });
  return {
    started: () => [ev("MATCH_STARTED", undefined, {}), ev("PLAYER_JOINED", "ana", { color: "red" }),
      ev("PLAYER_JOINED", "cpu", { color: "yellow", bot: true })],
    action: () => ev("PLAYER_ACTION", "ana", { column: 4 }),
    finished: () => ev("MATCH_FINISHED"),
  };
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const warn = { warn: vi.fn() };

let bus: EventBus, transport: FakeTransport, sender: EventSender;
beforeEach(() => {
  vi.useFakeTimers();
  bus = new EventBus();
  transport = new FakeTransport();
  warn.warn.mockReset();
  sender = new EventSender(transport, { log: warn, retry: new BackoffPolicy() });
  sender.attach(bus);
});
afterEach(() => vi.useRealTimers());

const publish = (e: ContractEvent) => bus.publish("game-event", { matchId: e.matchId, event: e });

describe("EventSender", () => {
  test("junta los eventos y los manda en un lote a los 500 ms", async () => {
    const m = match("connect4-a");
    m.started().forEach(publish);
    expect(transport.batches).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(transport.batches).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0].map((e) => e.type)).toEqual(["MATCH_STARTED", "PLAYER_JOINED", "PLAYER_JOINED"]);
    expect(sender.status).toMatchObject({ pending: 0, sent: 3, failing: false });
  });

  test("con 20 eventos no espera: manda el lote enseguida", async () => {
    const m = match("connect4-b");
    m.started().forEach(publish);
    for (let i = 0; i < 17; i++) publish(m.action());
    await flush();
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0]).toHaveLength(20);
  });

  test("una cola por partida: cada lote es de una sola partida y en orden", async () => {
    const a = match("connect4-a"), b = match("connect4-b");
    publish(a.started()[0]); publish(b.started()[0]); publish(a.action()); publish(b.action());
    await vi.advanceTimersByTimeAsync(500);
    expect(transport.batches).toHaveLength(2);
    for (const batch of transport.batches) {
      expect(new Set(batch.map((e) => e.matchId)).size).toBe(1);
      const ts = batch.map((e) => Date.parse(e.timestamp));
      expect(ts).toEqual([...ts].sort((x, y) => x - y));
    }
  });

  test("nunca hay dos envíos de la misma partida a la vez; lo que llega mientras tanto va después", async () => {
    const m = match("connect4-c");
    transport.replies = ["hang"];
    m.started().forEach(publish);
    await vi.advanceTimersByTimeAsync(500);
    publish(m.action());
    await vi.advanceTimersByTimeAsync(2000);
    expect(transport.batches).toHaveLength(1);       // sigue esperando la respuesta
    transport.release();
    await flush();
    expect(transport.batches).toHaveLength(2);
    expect(transport.batches[1].map((e) => e.type)).toEqual(["PLAYER_ACTION"]);
  });

  test("si GameStats no responde reintenta a 1, 2, 4 y 8 s sin perder eventos; otra partida no se frena", async () => {
    const a = match("connect4-a"), b = match("connect4-b");
    transport.down.add("connect4-a");
    const t0 = Date.now();
    a.started().forEach(publish);
    await vi.advanceTimersByTimeAsync(500);                 // primer intento de a: falla
    expect(sender.status.failing).toBe(true);
    publish(b.started()[0]);
    await vi.advanceTimersByTimeAsync(500);                 // b sale igual: su cola es aparte
    expect(transport.batches.some((x) => x[0].matchId === "connect4-b")).toBe(true);

    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 8000 - 500);
    const aTimes = transport.batches.flatMap((x, i) => (x[0].matchId === "connect4-a" ? [transport.times[i] - t0] : []));
    // 500 ms del lote y después esperas de 1, 2, 4, 8 y 8 s
    expect(aTimes).toEqual([500, 1500, 3500, 7500, 15500, 23500]);
    const aBatches = transport.batches.filter((x) => x[0].matchId === "connect4-a");
    expect(aBatches.at(-1)!.map((e) => e.eventId)).toEqual(aBatches[0].map((e) => e.eventId));   // los mismos: nada se perdió

    transport.down.clear();                                 // GameStats vuelve
    await vi.advanceTimersByTimeAsync(8000);
    expect(sender.status).toMatchObject({ pending: 0, failing: false });
  });

  test("un evento rechazado o un 4xx se avisa y no se reintenta", async () => {
    const m = match("connect4-d");
    transport.replies = [
      { kind: "ok", accepted: 2, rejected: [{ eventId: "connect4-d-e3", reason: "contexto" }] },
      { kind: "fatal", error: "HTTP 400: JSON inválido" },
    ];
    m.started().forEach(publish);
    await vi.advanceTimersByTimeAsync(500);
    publish(m.action());
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(transport.batches).toHaveLength(2);
    expect(warn.warn).toHaveBeenCalledTimes(2);
    expect(sender.status).toMatchObject({ pending: 0, sent: 2, rejected: 2, failing: false });
  });

  test("cierre de respaldo: PLAYER_LEFT por persona y MATCH_FINISHED sin data, continuando eventId y timestamp", async () => {
    const m = match("connect4-e");
    m.started().forEach(publish);
    const last = m.action(); publish(last);
    bus.publish("closed", { matchId: "connect4-e", humans: ["ana"] });
    await flush();
    const all = transport.all();
    expect(all.slice(-2).map((e) => [e.type, e.playerId, e.data])).toEqual([
      ["PLAYER_LEFT", "ana", undefined], ["MATCH_FINISHED", undefined, undefined],
    ]);
    expect(all.slice(-2).map((e) => e.eventId)).toEqual(["connect4-e-e5", "connect4-e-e6"]);
    expect(Date.parse(all.at(-2)!.timestamp)).toBeGreaterThan(Date.parse(last.timestamp));
    expect(all.at(-1)).toMatchObject({ gameId: "connect4", gameVersion: "1.0", matchId: "connect4-e" });
  });

  test("sin cierre de respaldo si ya hubo MATCH_FINISHED o si nunca empezó", async () => {
    const m = match("connect4-f");
    m.started().forEach(publish); publish(m.finished());
    bus.publish("closed", { matchId: "connect4-f", humans: ["ana"] });
    bus.publish("closed", { matchId: "connect4-nunca", humans: ["ana"] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.all().filter((e) => e.type === "MATCH_FINISHED")).toHaveLength(1);
    expect(transport.all().some((e) => e.type === "PLAYER_LEFT")).toBe(false);
    publish(m.action());                                 // después de MATCH_FINISHED no se manda nada
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.all().some((e) => e.type === "PLAYER_ACTION")).toBe(false);
  });

  test("al cerrar la pestaña: lo pendiente y el cierre de las partidas abiertas van con sendBeacon", async () => {
    const m = match("connect4-g");
    m.started().forEach(publish); publish(m.action());
    sender.flushOnUnload();
    expect(transport.batches).toHaveLength(0);
    const sent = transport.beacons.flat();
    expect(sent.map((e) => e.type)).toEqual(["MATCH_STARTED", "PLAYER_JOINED", "PLAYER_JOINED", "PLAYER_ACTION", "PLAYER_LEFT", "MATCH_FINISHED"]);
    expect(sent.find((e) => e.type === "PLAYER_LEFT")?.playerId).toBe("ana");   // la cpu no "se va"
  });

  test("la sesión de la consola publica 'closed' con las personas al cerrarse", async () => {
    const h = harness();
    const closed: unknown[] = [];
    h.bus.on("closed", (p) => closed.push(p));
    const { session } = h.open();
    session.stop("user");
    await vi.advanceTimersByTimeAsync(3000);
    expect(closed).toEqual([{ matchId: session.matchId, humans: ["ana"] }]);
  });
});
