/**
 * Sellado de eventos: timestamps estrictamente crecientes (+1 ms) y campos
 * del SDK (protocolo, sección 5).
 */
import { describe, expect, test } from "vitest";
import { EventStamper } from "../src/events/EventStamper";
import { MonotonicClock } from "../src/events/MonotonicClock";

/** Un reloj que devuelve los valores dados, en orden (repite el último). */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe("MonotonicClock", () => {
  test("con el reloj quieto, suma 1 ms en cada lectura", () => {
    const clock = new MonotonicClock(() => 1000);
    expect([clock.next(), clock.next(), clock.next()]).toEqual([1000, 1001, 1002]);
  });

  test("si el reloj de la PC va hacia atrás, sigue después del último", () => {
    const clock = new MonotonicClock(sequence(5000, 4000, 4500, 6000));
    expect([clock.next(), clock.next(), clock.next(), clock.next()]).toEqual([5000, 5001, 5002, 6000]);
  });

  test("si el reloj avanza, usa la hora real", () => {
    const clock = new MonotonicClock(sequence(100, 250, 900));
    expect([clock.next(), clock.next(), clock.next()]).toEqual([100, 250, 900]);
  });

  test("puede empezar después de un instante dado", () => {
    const clock = new MonotonicClock(() => 10, 2000);
    expect(clock.next()).toBe(2001);
  });

  test("con un reloj al azar, cada lectura es mayor que la anterior", () => {
    const clock = new MonotonicClock(() => 1_000_000 + Math.floor(Math.random() * 50));
    let previous = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 2000; i++) {
      const t = clock.next();
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
  });
});

describe("EventStamper", () => {
  const config = { matchId: "connect4-abc", gameId: "connect4", gameVersion: "1.0" };

  test("llena eventId, timestamp, gameId, gameVersion y matchId", () => {
    const s = new EventStamper({ ...config, now: () => Date.parse("2026-11-17T10:00:00.000Z") });
    expect(s.stamp({ type: "PLAYER_ACTION", action: "DISC_DROPPED", playerId: "ana", data: { column: 4 } })).toEqual({
      eventId: "connect4-abc-e1",
      timestamp: "2026-11-17T10:00:00.000Z",
      gameId: "connect4",
      gameVersion: "1.0",
      matchId: "connect4-abc",
      type: "PLAYER_ACTION",
      action: "DISC_DROPPED",
      playerId: "ana",
      data: { column: 4 },
    });
  });

  test("varios eventos en el mismo milisegundo: timestamps estrictamente crecientes", () => {
    const s = new EventStamper({ ...config, now: () => Date.parse("2026-11-17T10:00:00.998Z") });
    const events = [1, 2, 3].map(() => s.stamp({ type: "PLAYER_ACTION", action: "X" }));
    expect(events.map((e) => e.timestamp)).toEqual([
      "2026-11-17T10:00:00.998Z", "2026-11-17T10:00:00.999Z", "2026-11-17T10:00:01.000Z",
    ]);
    expect(events.map((e) => e.eventId)).toEqual(["connect4-abc-e1", "connect4-abc-e2", "connect4-abc-e3"]);
  });

  test("el juego no puede pisar los campos del SDK", () => {
    const s = new EventStamper({ ...config, now: () => 0 });
    const sneaky = { type: "MATCH_STARTED", matchId: "otra", gameId: "otro", eventId: "x" } as never;
    const e = s.stamp(sneaky);
    expect([e.matchId, e.gameId, e.eventId]).toEqual(["connect4-abc", "connect4", "connect4-abc-e1"]);
    expect(Object.keys(e)).not.toContain("action");
  });

  test("continueFrom sigue la numeración y el reloj del último evento visto (cierre de respaldo)", () => {
    const first = new EventStamper({ ...config, now: () => Date.parse("2026-11-17T10:00:05.000Z") });
    let last = first.stamp({ type: "MATCH_STARTED" });
    for (let i = 0; i < 6; i++) last = first.stamp({ type: "PLAYER_ACTION", action: "X" });
    expect(last.eventId).toBe("connect4-abc-e7");
    expect(last.timestamp).toBe("2026-11-17T10:00:05.006Z");

    // La consola tiene un reloj atrasado: igual sigue después del último.
    const backup = EventStamper.continueFrom(last, () => Date.parse("2026-11-17T09:59:00.000Z"));
    const left = backup.stamp({ type: "PLAYER_LEFT", playerId: "ana" });
    const finished = backup.stamp({ type: "MATCH_FINISHED" });
    expect([left.eventId, finished.eventId]).toEqual(["connect4-abc-e8", "connect4-abc-e9"]);
    expect([left.timestamp, finished.timestamp]).toEqual(["2026-11-17T10:00:05.007Z", "2026-11-17T10:00:05.008Z"]);
    expect([finished.gameId, finished.gameVersion, finished.matchId]).toEqual(["connect4", "1.0", "connect4-abc"]);
  });
});
