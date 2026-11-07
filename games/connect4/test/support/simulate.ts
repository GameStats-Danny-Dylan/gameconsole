/**
 * Simula partidas completas con el mismo código que usa el juego (Connect4Match
 * + GameStatsAdapter + EventStamper) y jugadas al azar con semilla: fichas,
 * deshacer, pistas, tiempos agotados, pausas y cierres a mitad de partida.
 * Devuelve los eventos tal como llegarían a GameStats.
 */
import { GameStatsAdapter, type Mode } from "../../src/adapter/GameStatsAdapter";
import { Connect4Match, type Seat } from "../../src/domain/Connect4Match";
import { EventStamper, type ContractEvent } from "../../src/standalone/EventStamper";

/** Generador pseudoaleatorio con semilla (mulberry32): mismas partidas en cada corrida. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Simulated {
  matchId: string;
  events: ContractEvent[];
  winner: string | null;
  stopped: boolean;
}

export function simulate(seed: number, mode: Mode, matchId = `connect4-sim-${mode}-${seed}`): Simulated {
  const rand = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  let clock = Date.parse("2026-11-07T12:00:00Z");
  const stamper = new EventStamper(matchId, "connect4", "1.0", () => (clock += 1 + Math.floor(rand() * 900)));
  const adapter = new GameStatsAdapter();
  const events: ContractEvent[] = [];
  const emit = (d: Parameters<EventStamper["stamp"]>[0] | null) => { if (d) events.push(stamper.stamp(d)); };

  const seats: [Seat, Seat] = mode === "vs-cpu"
    ? [{ playerId: "ana", name: "Ana", color: "red", kind: "human" }, { playerId: "cpu", name: "Computadora", color: "yellow", kind: "cpu" }]
    : [{ playerId: "ana", name: "Ana", color: "red", kind: "human" }, { playerId: "beto", name: "Beto", color: "yellow", kind: "human" }];
  const match = new Connect4Match(seats);
  match.facts.on((f) => emit(adapter.fromFact(f)));

  emit(adapter.matchStarted(mode, { turnSeconds: 30, ...(mode === "vs-cpu" ? { difficulty: "hard" } : {}) }));
  for (const s of seats) emit(adapter.playerJoined(s, s.kind === "cpu" ? "hard" : undefined));

  const stopAt = rand() < 0.15 ? 4 + Math.floor(rand() * 20) : Infinity;
  let turns = 0;
  while (!match.finished) {
    if (turns++ >= stopAt) {
      for (const s of seats) if (s.kind === "human") emit(adapter.playerLeft(s));
      emit(adapter.matchFinished("stopped"));
      return { matchId, events, winner: null, stopped: true };
    }
    const seat = match.current;
    const roll = rand();
    if (roll < 0.04) {                                   // pausa y sigue
      emit(adapter.paused(pick(["user", "hidden"])));
      emit(adapter.resumed());
      continue;
    }
    if (seat.kind === "human") {
      if (roll < 0.10 && match.canUndo(seat.playerId)) { match.undo(seat.playerId); continue; }
      if (roll < 0.14) { match.timeout(30); continue; }
      if (roll < 0.18) match.hint(pick(match.board.validColumns()));
      match.drop(pick(match.board.validColumns()));
    } else {
      match.drop(pick(match.board.validColumns()),
        { engine: "prolog-minimax", depth: 6, score: Math.round(rand() * 100 - 50), nodes: 1000, ms: 200 });
    }
  }
  emit(adapter.matchFinished("normal"));
  return { matchId, events, winner: match.winner?.playerId ?? null, stopped: false };
}
