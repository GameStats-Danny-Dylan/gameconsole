/**
 * Integración real: manda partidas a GameStats por el gateway y verifica que
 * Scala las analice COMPLETAS (ningún evento descartado), incluida una partida
 * entera contra la IA de Prolog.
 *
 *   docker compose up -d --build --wait       (en la raíz de gameconsole)
 *   GAMESTATS_URL=http://localhost:8000 npm run test:gamestats
 *
 * Sin GAMESTATS_URL la prueba se salta (así `npm test` no necesita Docker).
 */
import { describe, expect, test } from "vitest";
import { GameStatsAdapter } from "../src/adapter/GameStatsAdapter";
import { PrologStrategy } from "../src/ai/MoveStrategy";
import { Connect4Match, type Seat } from "../src/domain/Connect4Match";
import { EventStamper, type ContractEvent } from "../src/standalone/EventStamper";
import { simulate } from "./support/simulate";

// Variable de entorno de Node (sin depender de @types/node).
const BASE: string | undefined = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process?.env.GAMESTATS_URL;
const run = `${Date.now().toString(36)}`;

async function send(events: ContractEvent[]): Promise<void> {
  for (let i = 0; i < events.length; i += 20) {      // lotes de 20, como el EventSender
    const res = await fetch(`${BASE}/api/events`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(events.slice(i, i + 20)),
    });
    const body = await res.json();
    expect(body.rejected, JSON.stringify(body.rejected)).toEqual([]);
  }
}

async function result(matchId: string): Promise<any> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${BASE}/api/results/${matchId}`);
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Scala no guardó ${matchId}`);
}

describe.skipIf(!BASE)("GameStats real (por el gateway)", () => {
  test("partidas simuladas: Scala analiza todos los eventos y el mismo ganador", async () => {
    const sims = [1, 2, 3, 4, 5, 6].flatMap((seed) => [
      simulate(seed, "vs-cpu", `connect4-it-${run}-cpu-${seed}`),
      simulate(seed + 100, "local-2p", `connect4-it-${run}-2p-${seed}`),
    ]);
    await Promise.all(sims.map((s) => send(s.events)));   // varias partidas a la vez
    for (const s of sims) {
      const r = await result(s.matchId);
      expect(r.matchStats.totalEvents, s.matchId).toBe(s.events.length);
      expect(r.matchStats.winner, s.matchId).toBe(s.winner);
    }
  }, 60_000);

  test("una partida completa contra la IA de Prolog (difícil contra fácil)", async () => {
    const matchId = `connect4-it-${run}-prolog`;
    const stamper = new EventStamper(matchId);
    const adapter = new GameStatsAdapter();
    const events: ContractEvent[] = [];
    const emit = (d: ReturnType<GameStatsAdapter["fromFact"]>) => { if (d) events.push(stamper.stamp(d)); };
    const human: Seat = { playerId: "it-humano", name: "Humano", color: "red", kind: "human" };
    const cpu: Seat = { playerId: "cpu", name: "Computadora", color: "yellow", kind: "cpu" };
    const match = new Connect4Match([human, cpu]);
    match.facts.on((f) => emit(adapter.fromFact(f)));
    const ai = new PrologStrategy(`${BASE}/api/ai`);

    emit(adapter.matchStarted("vs-cpu", { difficulty: "hard", turnSeconds: 0 }));
    emit(adapter.playerJoined(human));
    emit(adapter.playerJoined(cpu, "hard"));
    while (!match.finished) {
      // El "humano" también lo juega Prolog, pero en fácil: la computadora en difícil debería ganar.
      const d = await ai.choose(match.board, match.current.color, match.current.kind === "cpu" ? "hard" : "easy");
      match.drop(d.column, match.current.kind === "cpu" ? d : undefined);
    }
    emit(adapter.matchFinished("normal"));
    await send(events);

    const r = await result(matchId);
    expect(r.matchStats.totalEvents).toBe(events.length);
    expect(r.matchStats.winner).toBe(match.winner?.playerId ?? null);
    console.log(`Prolog: ${match.moves} fichas, ganador ${match.winner?.playerId ?? "empate"}, `
      + `${events.filter((e) => e.action === "THREAT_CREATED").length} amenazas, patrones ${r.patterns.map((p: any) => p.rule).join(",") || "-"}`);
  }, 120_000);
});
