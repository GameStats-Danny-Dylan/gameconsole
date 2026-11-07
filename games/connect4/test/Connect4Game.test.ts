import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GameEventDraft } from "../src/adapter/GameStatsAdapter";
import type { AiDecision, MoveStrategy } from "../src/ai/MoveStrategy";
import { Connect4Game, RETRY_MS, seatsFor } from "../src/game/Connect4Game";
import type { Connect4View, GameHost, MatchContext, ViewHandlers, ViewModel } from "../src/game/ports";

/** IA falsa: cada pedido queda pendiente hasta que la prueba lo resuelve. */
class FakeAi implements MoveStrategy {
  pending: { resolve: (d: AiDecision) => void; reject: (e: Error) => void; difficulty: string }[] = [];
  choose(_b: unknown, _c: unknown, difficulty: string): Promise<AiDecision> {
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject, difficulty }));
  }
  answer(column: number) {
    this.pending.shift()!.resolve({ column, engine: "prolog-minimax", depth: 4, score: 1, nodes: 10, ms: 5 });
  }
}

class FakeHost implements GameHost {
  events: GameEventDraft[] = [];
  finished: { winner: string | null; reason: string }[] = [];
  errors: string[] = [];
  emit(e: GameEventDraft) { this.events.push(e); }
  finish(winner: string | null, reason: "normal" | "stopped") { this.finished.push({ winner, reason }); }
  error(message: string) { this.errors.push(message); }
  names() { return this.events.map((e) => e.action ?? e.type); }
}

class FakeView implements Connect4View {
  h!: ViewHandlers;
  vm!: ViewModel;
  bind(h: ViewHandlers) { this.h = h; }
  render(vm: ViewModel) { this.vm = vm; }
}

const ctx = (mode: MatchContext["mode"], options: Record<string, unknown> = {}): MatchContext => ({
  gameId: "connect4", matchId: "connect4-test", mode, options,
  players: mode === "vs-cpu"
    ? [{ playerId: "ana", name: "Ana", kind: "human", slot: 1 }]
    : [{ playerId: "ana", name: "Ana", kind: "human", slot: 1 }, { playerId: "beto", name: "Beto", kind: "human", slot: 2 }],
});

const flush = () => new Promise((r) => setTimeout(r, 0));

let ai: FakeAi, host: FakeHost, view: FakeView, game: Connect4Game;
function setup(c: MatchContext) {
  ai = new FakeAi(); host = new FakeHost(); view = new FakeView();
  game = new Connect4Game(host, view, ai);
  game.init(c);
}

describe("Connect4Game", () => {
  test("vs-cpu agrega a la computadora en el slot 2 y valida los modos", () => {
    expect(seatsFor(ctx("vs-cpu")).map((s) => `${s.playerId}:${s.color}`)).toEqual(["ana:red", "cpu:yellow"]);
    expect(() => seatsFor({ ...ctx("local-2p"), players: ctx("vs-cpu").players })).toThrow();
  });

  test("START emite MATCH_STARTED y un PLAYER_JOINED por jugador (el slot 1 primero)", () => {
    setup(ctx("vs-cpu", { difficulty: "hard" }));
    expect(game.state).toBe("ready");
    expect(host.events).toEqual([]);
    game.start();
    expect(host.events.slice(0, 3)).toEqual([
      { type: "MATCH_STARTED", data: { mode: "vs-cpu", turnSeconds: 0, difficulty: "hard" } },
      { type: "PLAYER_JOINED", playerId: "ana", data: { color: "red" } },
      { type: "PLAYER_JOINED", playerId: "cpu", data: { color: "yellow", bot: true, difficulty: "hard" } },
    ]);
  });

  test("la persona juega, la computadora responde con Prolog y su decisión va en data.ai", async () => {
    setup(ctx("vs-cpu", { difficulty: "hard" }));
    game.start();
    view.h.column(4);
    expect(view.vm.thinking).toBe(true);
    expect(view.vm.canPlay).toBe(false);
    view.h.column(5);                                  // mientras piensa, no se puede jugar
    expect(ai.pending[0].difficulty).toBe("hard");
    ai.answer(3);
    await flush();
    const drops = host.events.filter((e) => e.action === "DISC_DROPPED");
    expect(drops.map((e) => [e.playerId, e.data?.column])).toEqual([["ana", 4], ["cpu", 3]]);
    expect(drops[1].data?.ai).toMatchObject({ engine: "prolog-minimax", depth: 4 });
    expect(view.vm.canPlay).toBe(true);
  });

  test("si la IA responde durante la pausa, la jugada espera al RESUME", async () => {
    setup(ctx("vs-cpu"));
    game.start();
    view.h.column(4);
    game.pause("hidden");
    ai.answer(3);
    await flush();
    expect(host.names()).not.toContain("MATCH_RESUMED");
    expect(host.events.filter((e) => e.action === "DISC_DROPPED")).toHaveLength(1);
    game.resume();
    expect(host.names().slice(-3)).toEqual(["MATCH_PAUSED", "MATCH_RESUMED", "DISC_DROPPED"]);
    expect(host.events.find((e) => e.type === "MATCH_PAUSED")?.data).toEqual({ reason: "hidden" });
  });

  test("mensajes fuera de su estado se ignoran", () => {
    setup(ctx("local-2p"));
    game.resume(); game.pause();                       // en ready: nada
    expect(host.events).toEqual([]);
    game.start(); game.start();
    expect(host.names().filter((n) => n === "MATCH_STARTED")).toHaveLength(1);
  });

  test("STOP desde ready: no emite eventos, solo avisa que terminó", () => {
    setup(ctx("local-2p"));
    game.stop("user");
    expect(host.events).toEqual([]);
    expect(host.finished).toEqual([{ winner: null, reason: "stopped" }]);
  });

  test("STOP a mitad de partida: PLAYER_LEFT de cada persona y MATCH_FINISHED, una sola vez", () => {
    setup(ctx("vs-cpu"));
    game.start();
    view.h.column(4);
    game.stop("closed");
    game.stop("closed");
    expect(host.names().slice(-2)).toEqual(["PLAYER_LEFT", "MATCH_FINISHED"]);
    expect(host.events.filter((e) => e.type === "PLAYER_LEFT").map((e) => e.playerId)).toEqual(["ana"]);
    expect(host.names().filter((n) => n === "MATCH_FINISHED")).toHaveLength(1);
    expect(host.finished).toEqual([{ winner: null, reason: "stopped" }]);
  });

  test("ganar: CONNECT_FOUR, MATCH_FINISHED y FINISHED con el ganador", () => {
    setup(ctx("local-2p"));
    game.start();
    for (const c of [1, 1, 2, 2, 3, 3, 4]) view.h.column(c);
    expect(host.names().slice(-2)).toEqual(["CONNECT_FOUR", "MATCH_FINISHED"]);
    expect(host.finished).toEqual([{ winner: "ana", reason: "normal" }]);
    expect(view.vm.winner?.playerId).toBe("ana");
  });

  describe("reloj del turno", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test("al acabarse el tiempo: TURN_TIMEOUT y pasa el turno", () => {
      setup(ctx("local-2p", { turnSeconds: 15 }));
      game.start();
      expect(view.vm.timeLeft).toBe(15);
      vi.advanceTimersByTime(14_000);
      expect(view.vm.timeLeft).toBe(1);
      vi.advanceTimersByTime(1_000);
      expect(host.events.at(-1)).toEqual({ type: "PLAYER_ACTION", action: "TURN_TIMEOUT", playerId: "ana", data: { seconds: 15 } });
      expect(view.vm.current?.playerId).toBe("beto");
    });

    test("la pausa detiene el reloj", () => {
      setup(ctx("local-2p", { turnSeconds: 15 }));
      game.start();
      vi.advanceTimersByTime(5_000);
      game.pause();
      vi.advanceTimersByTime(60_000);
      game.resume();
      expect(view.vm.timeLeft).toBe(10);
      expect(host.names()).not.toContain("TURN_TIMEOUT");
    });

    test("si la IA falla, avisa y reintenta", async () => {
      setup(ctx("vs-cpu"));
      game.start();
      view.h.column(4);
      ai.pending.shift()!.reject(new Error("caída"));
      await vi.advanceTimersByTimeAsync(0);
      expect(host.errors[0]).toContain("caída");
      expect(view.vm.message).toMatch(/no responde/);
      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(ai.pending).toHaveLength(1);
    });
  });

  test("pista: HINT_USED con la columna que sugiere la IA (dificultad media), máximo 3", async () => {
    setup(ctx("local-2p"));
    game.start();
    view.h.hint();
    expect(ai.pending[0].difficulty).toBe("medium");
    ai.answer(5);
    await flush();
    expect(host.events.at(-1)).toEqual({ type: "PLAYER_ACTION", action: "HINT_USED", playerId: "ana", data: { column: 5 } });
    expect(view.vm.hintColumn).toBe(5);
    expect(view.vm.hintsLeft).toBe(2);
    view.h.hint();                                     // una pista por turno
    expect(ai.pending).toHaveLength(0);
  });

  test("deshacer contra la computadora: dos UNDO y vuelve el turno de la persona", async () => {
    setup(ctx("vs-cpu"));
    game.start();
    expect(view.vm.showUndo).toBe(true);
    view.h.column(4);
    ai.answer(3);
    await flush();
    expect(view.vm.canUndo).toBe(true);
    view.h.undo();
    expect(host.names().slice(-2)).toEqual(["UNDO", "UNDO"]);
    expect(view.vm.board.discCount).toBe(0);
    expect(view.vm.current?.playerId).toBe("ana");
  });
});
