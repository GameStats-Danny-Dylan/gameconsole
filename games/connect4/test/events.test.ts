/**
 * Los eventos del juego cumplen el contrato y las reglas de contexto de
 * GameStats. Se revisan miles de partidas al azar con la copia de las reglas
 * de Scala (support/scalaRules.ts), sin red.
 */
import { describe, expect, test } from "vitest";
import { GameStatsAdapter } from "../src/adapter/GameStatsAdapter";
import type { Seat } from "../src/domain/Connect4Match";
import { EventStamper } from "../src/standalone/EventStamper";
import { scalaRejections } from "./support/scalaRules";
import { simulate } from "./support/simulate";

describe("GameStatsAdapter", () => {
  const a = new GameStatsAdapter();
  const cpu: Seat = { playerId: "cpu", name: "Computadora", color: "yellow", kind: "cpu" };

  test("DISC_DROPPED con la decisión de la IA en data.ai", () => {
    const ai = { engine: "prolog-minimax", depth: 6, score: 12, nodes: 4821, ms: 85 };
    expect(a.fromFact({ kind: "disc", player: "cpu", cell: { column: 4, row: 2 }, ai })).toEqual({
      type: "PLAYER_ACTION", action: "DISC_DROPPED", playerId: "cpu", data: { column: 4, row: 2, ai },
    });
  });

  test("THREAT_BLOCKED lleva attackerId y CONNECT_FOUR la dirección", () => {
    expect(a.fromFact({ kind: "threatBlocked", player: "ana", cell: { column: 5, row: 1 }, attacker: "cpu" })?.data)
      .toEqual({ column: 5, row: 1, attackerId: "cpu" });
    expect(a.fromFact({ kind: "connectFour", player: "ana", direction: "diagonal", cells: [] })?.data)
      .toEqual({ direction: "diagonal" });
  });

  test("PLAYER_JOINED de la computadora: color, bot y dificultad", () => {
    expect(a.playerJoined(cpu, "hard")).toEqual({
      type: "PLAYER_JOINED", playerId: "cpu", data: { color: "yellow", bot: true, difficulty: "hard" },
    });
  });

  test("el empate no es una acción", () => {
    expect(a.fromFact({ kind: "draw" })).toBeNull();
  });
});

describe("EventStamper", () => {
  test("eventId {matchId}-e{n} y timestamps que nunca retroceden", () => {
    const times = [1000, 3000, 2000];
    const s = new EventStamper("connect4-x", "connect4", "1.0", () => times.shift()!);
    const e = [1, 2, 3].map(() => s.stamp({ type: "MATCH_PAUSED" }));
    expect(e.map((x) => x.eventId)).toEqual(["connect4-x-e1", "connect4-x-e2", "connect4-x-e3"]);
    expect(e[2].timestamp).toBe(e[1].timestamp);
    expect(e[0]).toMatchObject({ gameId: "connect4", gameVersion: "1.0", matchId: "connect4-x" });
  });
});

describe("partidas simuladas contra las reglas de GameStats", () => {
  test.each(["vs-cpu", "local-2p"] as const)("%s: 1500 partidas al azar, ningún evento descartado", (mode) => {
    let finished = 0, stopped = 0, undos = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const sim = simulate(seed, mode);
      const rejected = scalaRejections(sim.events);
      if (rejected.length) throw new Error(`semilla ${seed}: ${rejected.join("; ")}`);
      expect(sim.events[0].type).toBe("MATCH_STARTED");
      expect(sim.events.at(-1)!.type).toBe("MATCH_FINISHED");
      expect(sim.events.filter((e) => e.type === "MATCH_FINISHED")).toHaveLength(1);
      sim.stopped ? stopped++ : finished++;
      undos += sim.events.filter((e) => e.action === "UNDO").length;
    }
    // Que la simulación de verdad cubra los casos: partidas cerradas, terminadas y (vs-cpu) deshacer.
    expect(finished).toBeGreaterThan(1000);
    expect(stopped).toBeGreaterThan(100);
    if (mode === "vs-cpu") expect(undos).toBeGreaterThan(100);
  });

  test("la copia de las reglas sí detecta errores (control)", () => {
    const sim = simulate(7, "local-2p");
    const drop = sim.events.findIndex((e) => e.action === "DISC_DROPPED");
    const broken = sim.events.map((e, i) => (i === drop ? { ...e, data: { ...e.data, row: 3 } } : e));
    expect(scalaRejections(broken).length).toBeGreaterThan(0);
  });
});
