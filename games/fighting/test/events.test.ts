/**
 * Los eventos de la pelea cumplen el contrato y las reglas de contexto de
 * GameStats. Se revisan cientos de peleas al azar con la copia de las reglas
 * de Scala (support/scalaRules.ts), sin red.
 */
import type { ContractEvent } from "@gameconsole/sdk";
import { describe, expect, test } from "vitest";
import { GameStatsAdapter } from "../src/adapter/GameStatsAdapter";
import { scalaRejections, scalaWinner } from "./support/scalaRules";
import { simulate } from "./support/simulate";

describe("GameStatsAdapter", () => {
  const a = new GameStatsAdapter();

  test("MATCH_STARTED con stage y rounds; PLAYER_JOINED con character", () => {
    expect(a.matchStarted("dojo", 3)).toEqual({ type: "MATCH_STARTED", data: { stage: "dojo", rounds: 3 } });
    expect(a.playerJoined("ana", "brasa")).toEqual({ type: "PLAYER_JOINED", playerId: "ana", data: { character: "brasa" } });
  });

  test("ATTACK: golpe que conecta y golpe fallado (siempre con damage 0)", () => {
    expect(a.fromFact({ kind: "attack", attacker: "ana", target: "beto", move: "kick", hit: true, damage: 11, round: 2 })).toEqual({
      type: "PLAYER_ACTION", action: "ATTACK", playerId: "ana",
      data: { targetId: "beto", move: "kick", hit: true, damage: 11, round: 2 },
    });
    expect(a.fromFact({ kind: "attack", attacker: "ana", target: "beto", move: "punch", hit: false, damage: 7, round: 1 })?.data)
      .toMatchObject({ hit: false, damage: 0 });
  });

  test("BLOCK, COMBO, KNOCKDOWN, ROUND_WON y ROUND_DRAW con sus campos", () => {
    expect(a.fromFact({ kind: "block", defender: "beto", attacker: "ana", round: 1 }))
      .toMatchObject({ action: "BLOCK", playerId: "beto", data: { attackerId: "ana", round: 1 } });
    expect(a.fromFact({ kind: "combo", attacker: "ana", target: "beto", hits: 3, damage: 21, round: 1 }))
      .toMatchObject({ action: "COMBO", playerId: "ana", data: { targetId: "beto", hits: 3, damage: 21, round: 1 } });
    expect(a.fromFact({ kind: "knockdown", attacker: "ana", target: "beto", round: 1 }))
      .toMatchObject({ action: "KNOCKDOWN", playerId: "ana", data: { targetId: "beto", round: 1 } });
    expect(a.fromFact({ kind: "roundWon", winner: "ana", round: 1, remainingHealth: 40, method: "ko" }))
      .toMatchObject({ action: "ROUND_WON", playerId: "ana", data: { round: 1, remainingHealth: 40, method: "ko" } });
    expect(a.fromFact({ kind: "roundDraw", player: "ana", other: "beto", round: 2, method: "timeout" }))
      .toMatchObject({ action: "ROUND_DRAW", playerId: "ana", data: { round: 2, method: "timeout", otherId: "beto" } });
  });

  test("el fin de la pelea no es una acción", () => {
    expect(a.fromFact({ kind: "matchOver", winner: "ana" })).toBeNull();
  });
});

/**
 * Como en el contrato (fixture fighting_match_ok.json): el daño de los ATTACK
 * y los COMBO de un round es la vida que se quitó, sin contar dos veces. El
 * que pierde por KO recibió 100; remainingHealth es 100 menos lo recibido.
 */
function damageProblems(events: ContractEvent[]): string[] {
  const taken = new Map<string, number>(); // "round:playerId" -> daño recibido
  const problems: string[] = [];
  const get = (r: unknown, p: unknown) => taken.get(`${String(r)}:${String(p)}`) ?? 0;
  for (const e of events) {
    const d = (e.data ?? {}) as Record<string, unknown>;
    if (e.action === "ATTACK" || e.action === "COMBO") {
      const k = `${String(d.round)}:${String(d.targetId)}`;
      taken.set(k, (taken.get(k) ?? 0) + (d.damage as number));
    }
    if (e.action === "KNOCKDOWN" && get(d.round, d.targetId) !== 100)
      problems.push(`round ${String(d.round)}: ${String(d.targetId)} cayó con ${get(d.round, d.targetId)} de daño`);
    if (e.action === "ROUND_WON" && d.remainingHealth !== 100 - get(d.round, e.playerId))
      problems.push(`round ${String(d.round)}: remainingHealth ${String(d.remainingHealth)} con ${get(d.round, e.playerId)} de daño`);
  }
  return problems;
}

describe("peleas simuladas contra las reglas de GameStats", () => {
  test.each([1, 3, 5] as const)("mejor de %i: peleas al azar, ningún evento descartado", (rounds) => {
    const seen = new Set<string>();
    let finished = 0, stopped = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const sim = simulate(seed, rounds);
      const rejected = scalaRejections(sim.events);
      if (rejected.length) throw new Error(`semilla ${seed}: ${rejected.slice(0, 5).join("; ")}`);

      const e = sim.events;
      expect(e[0].type).toBe("MATCH_STARTED");
      expect(e.slice(1, 3).map((x) => x.type)).toEqual(["PLAYER_JOINED", "PLAYER_JOINED"]);
      expect(e.at(-1)!.type).toBe("MATCH_FINISHED");
      expect(e.filter((x) => x.type === "MATCH_FINISHED")).toHaveLength(1);
      expect(sim.finishes).toHaveLength(1);
      // timestamps estrictamente crecientes y eventId seguidos
      const ms = e.map((x) => Date.parse(x.timestamp));
      expect(ms.every((t, i) => i === 0 || t > ms[i - 1])).toBe(true);
      expect(e.map((x) => x.eventId)).toEqual(e.map((_, i) => `fighting-sim-${rounds}-${seed}-e${i + 1}`));

      if (sim.stopped) {
        stopped++;
        expect(sim.finishes[0]).toEqual({ winner: null, reason: "stopped" });
        expect(e.slice(-3).map((x) => x.type)).toEqual(["PLAYER_LEFT", "PLAYER_LEFT", "MATCH_FINISHED"]);
      } else {
        finished++;
        // El ganador que se le avisa a la consola es el mismo que calcula GameStats.
        expect(sim.finishes[0]).toEqual({ winner: scalaWinner(e), reason: "normal" });
      }
      for (const x of e) seen.add(x.action ?? x.type);
      expect(damageProblems(e), `semilla ${seed}`).toEqual([]);
    }
    expect(finished).toBeGreaterThan(80);
    expect(stopped).toBeGreaterThan(5);
    // La simulación de verdad cubre el catálogo de fighting.
    for (const a of ["ATTACK", "BLOCK", "COMBO", "KNOCKDOWN", "ROUND_WON", "MATCH_PAUSED", "MATCH_RESUMED", "PLAYER_LEFT"])
      expect(seen, a).toContain(a);
    if (rounds > 1) expect(seen).toContain("ROUND_DRAW");
  }, 120_000);

  test("la copia de las reglas sí detecta errores (control)", () => {
    const sim = simulate(3, 3);
    const won = sim.events.findIndex((e) => e.action === "ROUND_WON");
    const attack = sim.events.findIndex((e) => e.action === "ATTACK" && e.data?.hit === false);
    // un round que pasa de los rounds de la pelea; un golpe fallado con daño
    const broken = sim.events.map((e, i) =>
      i === won ? { ...e, data: { ...e.data, round: 4 } } :
      i === attack ? { ...e, data: { ...e.data, damage: 5 } } : e);
    expect(scalaRejections(broken)).toHaveLength(2);
    // una acción después del round que decide la pelea
    const last = sim.events.map((e) => e.action).lastIndexOf("ROUND_WON");
    const extra = { ...sim.events[last - 1], eventId: "x" };
    const after = [...sim.events.slice(0, last + 1), extra, ...sim.events.slice(last + 1)];
    expect(scalaRejections(after).join()).toMatch(/la pelea ya terminó/);
  });
});
